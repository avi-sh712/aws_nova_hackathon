"""
Diagram-to-Terraform Backend API
FastAPI application that analyzes architecture diagrams using Amazon Nova (Bedrock)
and generates Terraform HCL code.

Security:
- Server-side AWS credentials loaded from .env (never hardcoded)
- Per-request user credentials accepted via headers for multi-tenant use
- CORS restricted to configured origins
- No credentials logged or persisted
"""

import io
import json
import logging
import os
import re
import subprocess
import tempfile
import time
import uuid
from typing import Optional

import boto3
from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Load .env BEFORE accessing any os.getenv calls
load_dotenv()

# ---------------------------------------------------------------------------
# Configuration (all from .env — never hardcoded)
# ---------------------------------------------------------------------------
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "amazon.nova-lite-v1:0")

logger = logging.getLogger(__name__)
APP_ENV = os.getenv("APP_ENV", "development")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
APP_SECRET_KEY = os.getenv("APP_SECRET_KEY", "")

# Server-side fallback credentials (from .env)
_SERVER_AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "")
_SERVER_AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
_SERVER_AWS_SESSION_TOKEN = os.getenv("AWS_SESSION_TOKEN", "")
_SERVER_AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Diagram-to-Terraform API",
    description="Analyze architecture diagrams and generate Terraform code using Amazon Nova.",
    version="1.0.0",
    docs_url="/api/docs" if APP_ENV == "development" else None,  # Disable docs in prod
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=[
        "Content-Type",
        "X-AWS-Access-Key-Id",
        "X-AWS-Secret-Access-Key",
        "X-AWS-Session-Token",
        "X-AWS-Region",
    ],
)

# ---------------------------------------------------------------------------
# In-memory store (replace with DynamoDB / Redis in production)
# ---------------------------------------------------------------------------
diagrams: dict = {}

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class ConnectResponse(BaseModel):
    connected: bool
    account_id: str
    user_arn: str


class UploadResponse(BaseModel):
    diagram_id: str
    message: str


class AnalysisComponent(BaseModel):
    name: str
    type: str
    description: str
    connections: list[str] = []


class AnalysisResponse(BaseModel):
    diagram_id: str
    components: list[AnalysisComponent]
    summary: str


class TerraformResponse(BaseModel):
    diagram_id: str
    terraform_code: str


class ValidateRequest(BaseModel):
    terraform_code: str


class ValidateResponse(BaseModel):
    valid: bool
    message: str
    errors: list[str] = []


class DeployRequest(BaseModel):
    terraform_code: str


class DeployResponse(BaseModel):
    success: bool
    message: str
    output: str


class HealthResponse(BaseModel):
    status: str
    version: str


# ---------------------------------------------------------------------------
# Helpers — build per-request AWS clients
# ---------------------------------------------------------------------------

def _get_boto3_session(
    aws_access_key_id: str,
    aws_secret_access_key: str,
    aws_session_token: Optional[str] = None,
    aws_region: str = "us-east-1",
) -> boto3.Session:
    """Create a boto3 Session from supplied credentials."""
    kwargs = {
        "aws_access_key_id": aws_access_key_id,
        "aws_secret_access_key": aws_secret_access_key,
        "region_name": aws_region,
    }
    if aws_session_token:
        kwargs["aws_session_token"] = aws_session_token
    return boto3.Session(**kwargs)


def _resolve_creds(
    header_key: Optional[str],
    header_secret: Optional[str],
    header_token: Optional[str],
    header_region: Optional[str],
) -> boto3.Session:
    """
    Use header-provided credentials if available, otherwise fall back to
    server-side .env credentials. Raises 401 if neither is available.
    """
    key = header_key or _SERVER_AWS_ACCESS_KEY
    secret = header_secret or _SERVER_AWS_SECRET_KEY
    token = header_token or _SERVER_AWS_SESSION_TOKEN or None
    region = header_region or _SERVER_AWS_REGION

    if not key or not secret:
        raise HTTPException(
            status_code=401,
            detail="AWS credentials required. Provide credentials via the Connect step or configure server .env.",
        )
    return _get_boto3_session(key, secret, token, region)


def _resolve_env(
    header_key: Optional[str],
    header_secret: Optional[str],
    header_token: Optional[str],
    header_region: Optional[str],
) -> dict:
    """Build an env dict with AWS credentials for subprocess calls."""
    key = header_key or _SERVER_AWS_ACCESS_KEY
    secret = header_secret or _SERVER_AWS_SECRET_KEY
    token = header_token or _SERVER_AWS_SESSION_TOKEN
    region = header_region or _SERVER_AWS_REGION

    env = os.environ.copy()
    env["AWS_ACCESS_KEY_ID"] = key
    env["AWS_SECRET_ACCESS_KEY"] = secret
    env["AWS_DEFAULT_REGION"] = region
    if token:
        env["AWS_SESSION_TOKEN"] = token
    return env


def compress_image(image_bytes: bytes, max_size: int = 1024, quality: int = 80) -> bytes:
    """
    Compress and resize an image to reduce Bedrock token usage.
    - Resizes so the longest edge is at most `max_size` pixels.
    - Re-encodes as JPEG at the given quality.
    """
    try:
        from PIL import Image
    except ImportError:
        logger.warning("Pillow not installed — skipping image compression.")
        return image_bytes

    img = Image.open(io.BytesIO(image_bytes))

    # Convert RGBA/palette to RGB for JPEG encoding
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Resize if larger than max_size
    w, h = img.size
    if max(w, h) > max_size:
        ratio = max_size / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    compressed = buf.getvalue()
    logger.info(
        "Image compressed: %d KB → %d KB (%.0f%% reduction)",
        len(image_bytes) // 1024,
        len(compressed) // 1024,
        (1 - len(compressed) / len(image_bytes)) * 100,
    )
    return compressed


def invoke_nova(
    session: boto3.Session,
    prompt: str,
    image_bytes: Optional[bytes] = None,
    max_retries: int = 3,
) -> str:
    """
    Call Amazon Nova via the Bedrock Converse API.
    Includes automatic retry with exponential backoff for ThrottlingException.
    """
    bedrock = session.client("bedrock-runtime")

    content_blocks = []
    if image_bytes:
        compressed = compress_image(image_bytes)
        content_blocks.append({
            "image": {
                "format": "jpeg",
                "source": {
                    "bytes": compressed,
                },
            }
        })
    content_blocks.append({"text": prompt})

    messages = [{"role": "user", "content": content_blocks}]

    # Retry with exponential backoff for throttling
    for attempt in range(max_retries + 1):
        try:
            response = bedrock.converse(
                modelId=BEDROCK_MODEL_ID,
                messages=messages,
                inferenceConfig={
                    "maxTokens": 2048,
                    "temperature": 0.2,
                },
            )
            break
        except bedrock.exceptions.ThrottlingException as exc:
            if attempt < max_retries:
                wait = 2 ** attempt  # 1s, 2s, 4s
                logger.warning(
                    "Throttled by Bedrock (attempt %d/%d) — retrying in %ds…",
                    attempt + 1, max_retries, wait,
                )
                time.sleep(wait)
            else:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"Bedrock rate limit exceeded after {max_retries} retries: {exc}. "
                        "You may have hit the free-tier daily token quota. "
                        "Please wait and try again later."
                    ),
                )

    output_message = response["output"]["message"]
    result_text = ""
    for block in output_message["content"]:
        if "text" in block:
            result_text += block["text"]
    return result_text


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(status="healthy", version="1.0.0")


@app.post("/api/connect", response_model=ConnectResponse)
async def connect_aws(
    x_aws_access_key_id: Optional[str] = Header(None),
    x_aws_secret_access_key: Optional[str] = Header(None),
    x_aws_session_token: Optional[str] = Header(None),
    x_aws_region: Optional[str] = Header(None),
):
    """Validate AWS credentials by calling STS GetCallerIdentity."""
    session = _resolve_creds(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region,
    )
    try:
        sts = session.client("sts")
        identity = sts.get_caller_identity()
        return ConnectResponse(
            connected=True,
            account_id=identity["Account"],
            user_arn=identity["Arn"],
        )
    except Exception as exc:
        raise HTTPException(status_code=403, detail=f"AWS authentication failed: {exc}")


@app.post("/api/upload", response_model=UploadResponse)
async def upload_diagram(
    file: UploadFile = File(...),
    x_aws_access_key_id: Optional[str] = Header(None),
    x_aws_secret_access_key: Optional[str] = Header(None),
    x_aws_session_token: Optional[str] = Header(None),
    x_aws_region: Optional[str] = Header(None),
):
    """Upload an architecture diagram image."""
    _resolve_creds(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region,
    )

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    diagram_id = str(uuid.uuid4())
    file_bytes = await file.read()

    diagrams[diagram_id] = {
        "image_bytes": file_bytes,
        "analysis": None,
        "terraform": None,
    }

    return UploadResponse(diagram_id=diagram_id, message="Diagram uploaded successfully.")


@app.post("/api/analyze/{diagram_id}", response_model=AnalysisResponse)
async def analyze_diagram(
    diagram_id: str,
    x_aws_access_key_id: Optional[str] = Header(None),
    x_aws_secret_access_key: Optional[str] = Header(None),
    x_aws_session_token: Optional[str] = Header(None),
    x_aws_region: Optional[str] = Header(None),
):
    """Analyze an uploaded diagram using Amazon Nova."""
    session = _resolve_creds(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region,
    )

    if diagram_id not in diagrams:
        raise HTTPException(status_code=404, detail="Diagram not found.")

    image_bytes = diagrams[diagram_id].get("image_bytes")

    prompt = """You are an expert AWS Solutions Architect. Analyze the provided architecture diagram image and identify all AWS services and components shown.

Return your analysis as valid JSON with this exact structure:
{
  "components": [
    {
      "name": "component display name",
      "type": "AWS service type (e.g. EC2, S3, Lambda, VPC, RDS, etc.)",
      "description": "brief description of its role in the architecture",
      "connections": ["names of other components it connects to"]
    }
  ],
  "summary": "A brief overall summary of the architecture"
}

Be thorough and identify every component visible in the diagram. Only return valid JSON, no markdown formatting."""

    try:
        raw_response = invoke_nova(session, prompt, image_bytes=image_bytes)
        try:
            analysis = json.loads(raw_response)
        except json.JSONDecodeError:
            json_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw_response)
            if json_match:
                analysis = json.loads(json_match.group(1).strip())
            else:
                analysis = {"components": [], "summary": raw_response}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")

    diagrams[diagram_id]["analysis"] = analysis

    components = [
        AnalysisComponent(**comp) for comp in analysis.get("components", [])
    ]
    return AnalysisResponse(
        diagram_id=diagram_id,
        components=components,
        summary=analysis.get("summary", ""),
    )


@app.post("/api/generate/{diagram_id}", response_model=TerraformResponse)
async def generate_terraform(
    diagram_id: str,
    x_aws_access_key_id: Optional[str] = Header(None),
    x_aws_secret_access_key: Optional[str] = Header(None),
    x_aws_session_token: Optional[str] = Header(None),
    x_aws_region: Optional[str] = Header(None),
):
    """Generate Terraform HCL code from the diagram analysis."""
    session = _resolve_creds(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region,
    )

    if diagram_id not in diagrams:
        raise HTTPException(status_code=404, detail="Diagram not found.")

    analysis = diagrams[diagram_id].get("analysis")
    if not analysis:
        raise HTTPException(
            status_code=400,
            detail="Diagram has not been analyzed yet. Call /api/analyze first.",
        )

    prompt = f"""You are an expert Terraform engineer. Based on the following AWS architecture analysis, generate complete, production-ready Terraform (HCL) code that provisions all the identified components.

Architecture Analysis:
{json.dumps(analysis, indent=2)}

Requirements:
1. Use the AWS provider with a configurable region variable.
2. Include all necessary resource blocks for each identified component.
3. Set up proper security groups, IAM roles, and networking as needed.
4. Use Terraform best practices (variables, locals, outputs).
5. Add comments explaining each resource block.
6. Make the code modular and ready to apply.

Return ONLY the Terraform HCL code, no markdown formatting or explanations outside the code."""

    try:
        raw_response = invoke_nova(session, prompt)
        terraform_code = raw_response.strip()
        if terraform_code.startswith("```"):
            lines = terraform_code.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            terraform_code = "\n".join(lines)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Code generation failed: {exc}")

    diagrams[diagram_id]["terraform"] = terraform_code
    return TerraformResponse(diagram_id=diagram_id, terraform_code=terraform_code)


@app.post("/api/validate", response_model=ValidateResponse)
async def validate_terraform(
    request: ValidateRequest,
    x_aws_access_key_id: Optional[str] = Header(None),
    x_aws_secret_access_key: Optional[str] = Header(None),
    x_aws_session_token: Optional[str] = Header(None),
    x_aws_region: Optional[str] = Header(None),
):
    """Validate Terraform HCL code by running terraform validate."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tf_file = os.path.join(tmpdir, "main.tf")
        with open(tf_file, "w") as f:
            f.write(request.terraform_code)

        init_result = subprocess.run(
            ["terraform", "init", "-backend=false", "-no-color"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=60,
        )

        if init_result.returncode != 0:
            return ValidateResponse(
                valid=False,
                message="Terraform init failed.",
                errors=[init_result.stderr],
            )

        validate_result = subprocess.run(
            ["terraform", "validate", "-no-color"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=60,
        )

        if validate_result.returncode == 0:
            return ValidateResponse(valid=True, message="Terraform configuration is valid.")
        else:
            errors = [
                line for line in validate_result.stderr.split("\n") if line.strip()
            ]
            return ValidateResponse(
                valid=False, message="Terraform validation failed.", errors=errors,
            )


@app.post("/api/deploy", response_model=DeployResponse)
async def deploy_terraform(
    request: DeployRequest,
    x_aws_access_key_id: Optional[str] = Header(None),
    x_aws_secret_access_key: Optional[str] = Header(None),
    x_aws_session_token: Optional[str] = Header(None),
    x_aws_region: Optional[str] = Header(None),
):
    """
    Deploy Terraform code to the user's AWS account.
    Runs terraform init + terraform apply -auto-approve with the caller's credentials.
    """
    _resolve_creds(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region,
    )

    env = _resolve_env(
        x_aws_access_key_id, x_aws_secret_access_key,
        x_aws_session_token, x_aws_region,
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        tf_file = os.path.join(tmpdir, "main.tf")
        with open(tf_file, "w") as f:
            f.write(request.terraform_code)

        # terraform init
        init_result = subprocess.run(
            ["terraform", "init", "-no-color"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
        )

        if init_result.returncode != 0:
            return DeployResponse(
                success=False,
                message="Terraform init failed.",
                output=init_result.stderr,
            )

        # terraform apply -auto-approve
        apply_result = subprocess.run(
            ["terraform", "apply", "-auto-approve", "-no-color"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=600,
            env=env,
        )

        if apply_result.returncode == 0:
            return DeployResponse(
                success=True,
                message="Infrastructure deployed successfully! 🎉",
                output=apply_result.stdout,
            )
        else:
            return DeployResponse(
                success=False,
                message="Terraform apply failed.",
                output=apply_result.stderr + "\n" + apply_result.stdout,
            )


# ---------------------------------------------------------------------------
# Entrypoint (for local development)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
