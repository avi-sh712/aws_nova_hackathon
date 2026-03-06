"use client";

import React, { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import axios from "axios";
import {
    Upload,
    Scan,
    Code2,
    ShieldCheck,
    CheckCircle2,
    XCircle,
    Loader2,
    Sparkles,
    ArrowRight,
    FileCode2,
    Cpu,
    Copy,
    Check,
    KeyRound,
    Rocket,
    Eye,
    EyeOff,
    AlertTriangle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface AwsCreds {
    aws_access_key_id: string;
    aws_secret_access_key: string;
    aws_session_token: string;
    aws_region: string;
}

interface Component {
    name: string;
    type: string;
    description: string;
    connections: string[];
}

interface AnalysisResult {
    diagram_id: string;
    components: Component[];
    summary: string;
}

interface TerraformResult {
    diagram_id: string;
    terraform_code: string;
}

interface ValidateResult {
    valid: boolean;
    message: string;
    errors: string[];
}

interface DeployResult {
    success: boolean;
    message: string;
    output: string;
}

type Step = "connect" | "upload" | "analyze" | "generate" | "validate" | "deploy";

// ---------------------------------------------------------------------------
// Step Config
// ---------------------------------------------------------------------------
const steps: { key: Step; label: string; icon: React.ReactNode }[] = [
    { key: "connect", label: "Connect", icon: <KeyRound size={18} /> },
    { key: "upload", label: "Upload", icon: <Upload size={18} /> },
    { key: "analyze", label: "Analyze", icon: <Scan size={18} /> },
    { key: "generate", label: "Generate", icon: <Code2 size={18} /> },
    { key: "validate", label: "Validate", icon: <ShieldCheck size={18} /> },
    { key: "deploy", label: "Deploy", icon: <Rocket size={18} /> },
];

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function Home() {
    // State
    const [currentStep, setCurrentStep] = useState<Step>("connect");
    const [creds, setCreds] = useState<AwsCreds>({
        aws_access_key_id: "",
        aws_secret_access_key: "",
        aws_session_token: "",
        aws_region: "us-east-1",
    });
    const [showSecret, setShowSecret] = useState(false);
    const [diagramId, setDiagramId] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("");
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [terraform, setTerraform] = useState<TerraformResult | null>(null);
    const [validation, setValidation] = useState<ValidateResult | null>(null);
    const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [deployConfirm, setDeployConfirm] = useState(false);

    // Helper: attach creds to every API call
    const credsHeaders = {
        "X-AWS-Access-Key-Id": creds.aws_access_key_id,
        "X-AWS-Secret-Access-Key": creds.aws_secret_access_key,
        "X-AWS-Session-Token": creds.aws_session_token,
        "X-AWS-Region": creds.aws_region,
    };

    // -----------------------------------------------------------------------
    // Connect (validate credentials)
    // -----------------------------------------------------------------------
    const handleConnect = async () => {
        if (!creds.aws_access_key_id || !creds.aws_secret_access_key) {
            setError("Access Key ID and Secret Access Key are required.");
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const res = await axios.post(
                `${API_BASE}/api/connect`,
                {},
                { headers: credsHeaders }
            );
            if (res.data.connected) {
                setCurrentStep("upload");
            }
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err)
                ? err.response?.data?.detail || err.message
                : "Connection failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Upload
    // -----------------------------------------------------------------------
    const onDrop = useCallback(
        async (acceptedFiles: File[]) => {
            const file = acceptedFiles[0];
            if (!file) return;

            setError(null);
            setLoading(true);
            setPreviewUrl(URL.createObjectURL(file));
            setFileName(file.name);

            const formData = new FormData();
            formData.append("file", file);

            try {
                const res = await axios.post(`${API_BASE}/api/upload`, formData, {
                    headers: { "Content-Type": "multipart/form-data", ...credsHeaders },
                });
                setDiagramId(res.data.diagram_id);
                setCurrentStep("analyze");
            } catch (err: unknown) {
                const msg = axios.isAxiosError(err)
                    ? err.response?.data?.detail || err.message
                    : "Upload failed";
                setError(msg);
            } finally {
                setLoading(false);
            }
        },
        [creds]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".svg"] },
        maxFiles: 1,
        multiple: false,
    });

    // -----------------------------------------------------------------------
    // Analyze
    // -----------------------------------------------------------------------
    const handleAnalyze = async () => {
        if (!diagramId) return;
        setError(null);
        setLoading(true);
        try {
            const res = await axios.post(
                `${API_BASE}/api/analyze/${diagramId}`,
                {},
                { headers: credsHeaders }
            );
            setAnalysis(res.data);
            setCurrentStep("generate");
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err)
                ? err.response?.data?.detail || err.message
                : "Analysis failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Generate
    // -----------------------------------------------------------------------
    const handleGenerate = async () => {
        if (!diagramId) return;
        setError(null);
        setLoading(true);
        try {
            const res = await axios.post(
                `${API_BASE}/api/generate/${diagramId}`,
                {},
                { headers: credsHeaders }
            );
            setTerraform(res.data);
            setCurrentStep("validate");
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err)
                ? err.response?.data?.detail || err.message
                : "Generation failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Validate
    // -----------------------------------------------------------------------
    const handleValidate = async () => {
        if (!terraform) return;
        setError(null);
        setLoading(true);
        try {
            const res = await axios.post(
                `${API_BASE}/api/validate`,
                { terraform_code: terraform.terraform_code },
                { headers: credsHeaders }
            );
            setValidation(res.data);
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err)
                ? err.response?.data?.detail || err.message
                : "Validation failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Deploy
    // -----------------------------------------------------------------------
    const handleDeploy = async () => {
        if (!terraform) return;
        setError(null);
        setLoading(true);
        try {
            const res = await axios.post(
                `${API_BASE}/api/deploy`,
                { terraform_code: terraform.terraform_code },
                { headers: credsHeaders }
            );
            setDeployResult(res.data);
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err)
                ? err.response?.data?.detail || err.message
                : "Deployment failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // -----------------------------------------------------------------------
    // Copy code
    // -----------------------------------------------------------------------
    const handleCopy = () => {
        if (!terraform) return;
        navigator.clipboard.writeText(terraform.terraform_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // -----------------------------------------------------------------------
    // Reset
    // -----------------------------------------------------------------------
    const handleReset = () => {
        setCurrentStep("connect");
        setCreds({ aws_access_key_id: "", aws_secret_access_key: "", aws_session_token: "", aws_region: "us-east-1" });
        setDiagramId(null);
        setPreviewUrl(null);
        setFileName("");
        setAnalysis(null);
        setTerraform(null);
        setValidation(null);
        setDeployResult(null);
        setError(null);
        setCopied(false);
        setDeployConfirm(false);
    };

    // -----------------------------------------------------------------------
    // Step helpers
    // -----------------------------------------------------------------------
    const stepIndex = steps.findIndex((s) => s.key === currentStep);
    const isStepDone = (key: Step) =>
        steps.findIndex((s) => s.key === key) < stepIndex;
    const isStepActive = (key: Step) => key === currentStep;

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
        <div className="min-h-screen w-full pb-20">
            {/* ────────────── HEADER ────────────── */}
            <header className="sticky top-0 z-50 border-b border-white/5 bg-nova-dark-surface/80 backdrop-blur-xl">
                <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nova-gradient">
                            <Sparkles size={22} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white">
                                Nova <span className="gradient-text">Architect</span>
                            </h1>
                            <p className="text-xs text-nova-gray-400">
                                Diagram → Terraform → Deploy
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleReset}
                        className="btn-nova-outline text-sm"
                        id="reset-button"
                    >
                        Start Over
                    </button>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl px-6 pt-8">
                {/* ────────────── STEP PROGRESS BAR ────────────── */}
                <div className="mb-10 flex items-center justify-center gap-1 sm:gap-2">
                    {steps.map((step, i) => (
                        <React.Fragment key={step.key}>
                            <div className="flex flex-col items-center gap-1.5">
                                <div
                                    className={
                                        isStepDone(step.key)
                                            ? "step-indicator-done"
                                            : isStepActive(step.key)
                                                ? "step-indicator-active"
                                                : "step-indicator-pending"
                                    }
                                >
                                    {isStepDone(step.key) ? (
                                        <CheckCircle2 size={18} />
                                    ) : (
                                        step.icon
                                    )}
                                </div>
                                <span
                                    className={`text-[10px] sm:text-xs font-medium ${isStepActive(step.key)
                                            ? "text-nova-purple-light"
                                            : isStepDone(step.key)
                                                ? "text-green-400"
                                                : "text-nova-gray-400"
                                        }`}
                                >
                                    {step.label}
                                </span>
                            </div>
                            {i < steps.length - 1 && (
                                <div
                                    className={`mx-1 sm:mx-2 mb-5 h-px w-8 sm:w-14 ${isStepDone(steps[i + 1].key) ||
                                            isStepActive(steps[i + 1].key)
                                            ? "bg-nova-purple"
                                            : "bg-white/10"
                                        }`}
                                />
                            )}
                        </React.Fragment>
                    ))}
                </div>

                {/* ────────────── ERROR BANNER ────────────── */}
                {error && (
                    <div className="animate-fade-in mb-8 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                        <XCircle size={20} className="flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════════ */}
                {/*  STEP: CONNECT                                                  */}
                {/* ════════════════════════════════════════════════════════════════ */}
                {currentStep === "connect" && (
                    <div className="animate-fade-in mx-auto max-w-lg">
                        <div className="mb-8 text-center">
                            <h2 className="mb-2 text-3xl font-bold text-white">
                                Connect Your{" "}
                                <span className="gradient-text">AWS Account</span>
                            </h2>
                            <p className="text-nova-gray-400">
                                Enter your AWS credentials to get started. Your keys are sent
                                securely to the backend and are never stored.
                            </p>
                        </div>

                        <div className="glass-card space-y-5">
                            {/* Access Key ID */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-nova-gray-400">
                                    AWS Access Key ID <span className="text-nova-pink">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={creds.aws_access_key_id}
                                    onChange={(e) =>
                                        setCreds({ ...creds, aws_access_key_id: e.target.value })
                                    }
                                    placeholder="AKIA..."
                                    className="w-full rounded-xl border border-white/10 bg-nova-black/60 px-4 py-3 text-sm text-white placeholder-nova-gray-600 outline-none ring-nova-purple/40 transition focus:border-nova-purple/50 focus:ring-2"
                                    id="input-access-key"
                                />
                            </div>

                            {/* Secret Key */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-nova-gray-400">
                                    AWS Secret Access Key{" "}
                                    <span className="text-nova-pink">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showSecret ? "text" : "password"}
                                        value={creds.aws_secret_access_key}
                                        onChange={(e) =>
                                            setCreds({
                                                ...creds,
                                                aws_secret_access_key: e.target.value,
                                            })
                                        }
                                        placeholder="••••••••••••••••"
                                        className="w-full rounded-xl border border-white/10 bg-nova-black/60 px-4 py-3 pr-12 text-sm text-white placeholder-nova-gray-600 outline-none ring-nova-purple/40 transition focus:border-nova-purple/50 focus:ring-2"
                                        id="input-secret-key"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSecret(!showSecret)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-nova-gray-400 hover:text-white transition"
                                    >
                                        {showSecret ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Session Token (optional) */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-nova-gray-400">
                                    Session Token{" "}
                                    <span className="text-xs text-nova-gray-600">(optional)</span>
                                </label>
                                <input
                                    type="password"
                                    value={creds.aws_session_token}
                                    onChange={(e) =>
                                        setCreds({ ...creds, aws_session_token: e.target.value })
                                    }
                                    placeholder="Optional — for temporary credentials"
                                    className="w-full rounded-xl border border-white/10 bg-nova-black/60 px-4 py-3 text-sm text-white placeholder-nova-gray-600 outline-none ring-nova-purple/40 transition focus:border-nova-purple/50 focus:ring-2"
                                    id="input-session-token"
                                />
                            </div>

                            {/* Region */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-nova-gray-400">
                                    AWS Region
                                </label>
                                <select
                                    value={creds.aws_region}
                                    onChange={(e) =>
                                        setCreds({ ...creds, aws_region: e.target.value })
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-nova-black/60 px-4 py-3 text-sm text-white outline-none ring-nova-purple/40 transition focus:border-nova-purple/50 focus:ring-2"
                                    id="input-region"
                                >
                                    <option value="us-east-1">US East (N. Virginia)</option>
                                    <option value="us-west-2">US West (Oregon)</option>
                                    <option value="eu-west-1">EU (Ireland)</option>
                                    <option value="eu-central-1">EU (Frankfurt)</option>
                                    <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                                    <option value="ap-northeast-1">Asia Pacific (Tokyo)</option>
                                </select>
                            </div>

                            {/* Connect button */}
                            <button
                                onClick={handleConnect}
                                disabled={loading}
                                className="btn-nova flex w-full items-center justify-center gap-2"
                                id="connect-button"
                            >
                                {loading ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <KeyRound size={18} />
                                )}
                                {loading ? "Connecting…" : "Connect to AWS"}
                            </button>

                            <p className="text-center text-xs text-nova-gray-600">
                                🔒 Credentials are used per-session only and never persisted.
                            </p>
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════════ */}
                {/*  STEP: UPLOAD                                                   */}
                {/* ════════════════════════════════════════════════════════════════ */}
                {currentStep === "upload" && (
                    <div className="animate-fade-in mx-auto max-w-2xl">
                        <div className="mb-8 text-center">
                            <h2 className="mb-2 text-3xl font-bold text-white">
                                Upload Your{" "}
                                <span className="gradient-text">Architecture</span> Diagram
                            </h2>
                            <p className="text-nova-gray-400">
                                Drop an image of your AWS architecture and let Nova do the rest.
                            </p>
                        </div>

                        <div
                            {...getRootProps()}
                            className={`dropzone ${isDragActive ? "dropzone-active" : ""}`}
                            id="upload-dropzone"
                        >
                            <input {...getInputProps()} />
                            {loading ? (
                                <Loader2
                                    size={48}
                                    className="animate-spin text-nova-purple"
                                />
                            ) : (
                                <>
                                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-nova-gradient-subtle">
                                        <Upload size={28} className="text-nova-purple-light" />
                                    </div>
                                    <p className="mb-1 text-lg font-semibold text-white">
                                        {isDragActive
                                            ? "Drop it here..."
                                            : "Drag & drop your diagram"}
                                    </p>
                                    <p className="text-sm text-nova-gray-400">
                                        or click to browse — PNG, JPG, WEBP, SVG
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════════ */}
                {/*  STEP: ANALYZE                                                  */}
                {/* ════════════════════════════════════════════════════════════════ */}
                {currentStep === "analyze" && (
                    <div className="animate-fade-in mx-auto max-w-4xl">
                        <div className="mb-8 text-center">
                            <h2 className="mb-2 text-3xl font-bold text-white">
                                Ready to <span className="gradient-text">Analyze</span>
                            </h2>
                            <p className="text-nova-gray-400">
                                Amazon Nova will identify every AWS component in your diagram.
                            </p>
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            {/* Preview card */}
                            <div className="glass-card flex flex-col items-center">
                                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-nova-gray-400">
                                    <FileCode2 size={16} /> Uploaded Diagram
                                </h3>
                                {previewUrl && (
                                    <img
                                        src={previewUrl}
                                        alt="Architecture diagram"
                                        className="max-h-72 w-full rounded-xl border border-white/10 object-contain"
                                    />
                                )}
                                <p className="mt-3 text-xs text-nova-gray-400">{fileName}</p>
                            </div>

                            {/* Action card */}
                            <div className="glass-card flex flex-col items-center justify-center text-center">
                                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-nova-gradient-subtle">
                                    <Cpu size={36} className="text-nova-purple-light" />
                                </div>
                                <p className="mb-6 text-sm text-nova-gray-400">
                                    Click below to send your diagram to Amazon Nova for AI-powered
                                    analysis.
                                </p>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={loading}
                                    className="btn-nova flex items-center gap-2"
                                    id="analyze-button"
                                >
                                    {loading ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Scan size={18} />
                                    )}
                                    {loading ? "Analyzing…" : "Analyze Diagram"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════════ */}
                {/*  STEP: GENERATE                                                 */}
                {/* ════════════════════════════════════════════════════════════════ */}
                {currentStep === "generate" && analysis && (
                    <div className="animate-fade-in mx-auto max-w-6xl">
                        <div className="mb-8 text-center">
                            <h2 className="mb-2 text-3xl font-bold text-white">
                                Components <span className="gradient-text">Detected</span>
                            </h2>
                            <p className="text-nova-gray-400">{analysis.summary}</p>
                        </div>

                        {/* Component cards */}
                        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {analysis.components.map((comp, i) => (
                                <div
                                    key={i}
                                    className="glass-card-hover animate-slide-up"
                                    style={{ animationDelay: `${i * 80}ms` }}
                                >
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="inline-block rounded-lg bg-nova-purple/20 px-2 py-0.5 text-xs font-bold text-nova-purple-light">
                                            {comp.type}
                                        </span>
                                    </div>
                                    <h4 className="mb-1 font-semibold text-white">{comp.name}</h4>
                                    <p className="text-sm text-nova-gray-400">
                                        {comp.description}
                                    </p>
                                    {comp.connections.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-1">
                                            {comp.connections.map((c, j) => (
                                                <span
                                                    key={j}
                                                    className="rounded-full border border-nova-blue/30 bg-nova-blue/10 px-2 py-0.5 text-xs text-nova-blue-light"
                                                >
                                                    → {c}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Generate button */}
                        <div className="text-center">
                            <button
                                onClick={handleGenerate}
                                disabled={loading}
                                className="btn-nova-pink mx-auto flex items-center gap-2"
                                id="generate-button"
                            >
                                {loading ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <Code2 size={18} />
                                )}
                                {loading ? "Generating Terraform…" : "Generate Terraform Code"}
                                {!loading && <ArrowRight size={16} />}
                            </button>
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════════ */}
                {/*  STEP: VALIDATE                                                 */}
                {/* ════════════════════════════════════════════════════════════════ */}
                {currentStep === "validate" && terraform && (
                    <div className="animate-fade-in mx-auto max-w-6xl">
                        <div className="mb-8 text-center">
                            <h2 className="mb-2 text-3xl font-bold text-white">
                                Generated{" "}
                                <span className="gradient-text">Terraform</span> Code
                            </h2>
                            <p className="text-nova-gray-400">
                                Review your infrastructure code, validate it, then deploy.
                            </p>
                        </div>

                        {/* Code panel */}
                        <div className="glass-card mb-6">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-nova-gray-400">
                                    <FileCode2 size={16} /> main.tf
                                </h3>
                                <button
                                    onClick={handleCopy}
                                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-nova-gray-400 transition-colors hover:text-white"
                                    id="copy-button"
                                >
                                    {copied ? (
                                        <Check size={14} className="text-green-400" />
                                    ) : (
                                        <Copy size={14} />
                                    )}
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <div className="code-block">
                                <SyntaxHighlighter
                                    language="hcl"
                                    style={vscDarkPlus}
                                    customStyle={{
                                        background: "transparent",
                                        margin: 0,
                                        padding: 0,
                                        fontSize: "0.85rem",
                                    }}
                                    showLineNumbers
                                >
                                    {terraform.terraform_code}
                                </SyntaxHighlighter>
                            </div>
                        </div>

                        {/* Actions row */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex gap-3">
                                <button
                                    onClick={handleValidate}
                                    disabled={loading}
                                    className="btn-nova flex items-center gap-2"
                                    id="validate-button"
                                >
                                    {loading ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <ShieldCheck size={18} />
                                    )}
                                    {loading ? "Validating…" : "Validate"}
                                </button>

                                {validation?.valid && (
                                    <button
                                        onClick={() => {
                                            setCurrentStep("deploy");
                                        }}
                                        className="btn-nova-pink flex items-center gap-2 animate-fade-in"
                                        id="proceed-deploy-button"
                                    >
                                        <Rocket size={18} />
                                        Proceed to Deploy
                                        <ArrowRight size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Validation result */}
                            {validation && (
                                <div
                                    className={`animate-fade-in w-full max-w-xl rounded-xl border p-4 ${validation.valid
                                            ? "border-green-500/30 bg-green-500/10 text-green-300"
                                            : "border-red-500/30 bg-red-500/10 text-red-300"
                                        }`}
                                >
                                    <div className="flex items-center gap-2 font-semibold">
                                        {validation.valid ? (
                                            <CheckCircle2 size={20} />
                                        ) : (
                                            <XCircle size={20} />
                                        )}
                                        {validation.message}
                                    </div>
                                    {validation.errors.length > 0 && (
                                        <ul className="mt-2 list-disc pl-5 text-sm">
                                            {validation.errors.map((e, i) => (
                                                <li key={i}>{e}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════════ */}
                {/*  STEP: DEPLOY                                                   */}
                {/* ════════════════════════════════════════════════════════════════ */}
                {currentStep === "deploy" && terraform && (
                    <div className="animate-fade-in mx-auto max-w-3xl">
                        <div className="mb-8 text-center">
                            <h2 className="mb-2 text-3xl font-bold text-white">
                                Deploy to{" "}
                                <span className="gradient-text">AWS</span>
                            </h2>
                            <p className="text-nova-gray-400">
                                Review and apply your Terraform configuration to your AWS
                                account.
                            </p>
                        </div>

                        {!deployResult && (
                            <div className="glass-card mb-6">
                                {/* Warning */}
                                <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-300">
                                    <AlertTriangle size={22} className="mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold">This will create real AWS resources</p>
                                        <p className="mt-1 text-sm text-amber-300/80">
                                            Terraform will provision infrastructure in your AWS account
                                            (region: <strong>{creds.aws_region}</strong>). This may
                                            incur charges. Review the code above carefully before
                                            proceeding.
                                        </p>
                                    </div>
                                </div>

                                {/* Confirmation checkbox */}
                                <label className="mb-6 flex cursor-pointer items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={deployConfirm}
                                        onChange={(e) => setDeployConfirm(e.target.checked)}
                                        className="h-5 w-5 rounded border-white/20 bg-nova-dark-card accent-nova-purple"
                                        id="deploy-confirm-checkbox"
                                    />
                                    <span className="text-sm text-nova-gray-400">
                                        I have reviewed the Terraform code and understand that real
                                        resources will be created in my AWS account.
                                    </span>
                                </label>

                                <button
                                    onClick={handleDeploy}
                                    disabled={loading || !deployConfirm}
                                    className="btn-nova-pink flex w-full items-center justify-center gap-2"
                                    id="deploy-button"
                                >
                                    {loading ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Rocket size={18} />
                                    )}
                                    {loading
                                        ? "Deploying — this may take a few minutes…"
                                        : "🚀 Deploy to AWS"}
                                </button>
                            </div>
                        )}

                        {/* Deploy result */}
                        {deployResult && (
                            <div
                                className={`animate-fade-in glass-card ${deployResult.success
                                        ? "border-green-500/30"
                                        : "border-red-500/30"
                                    }`}
                            >
                                <div
                                    className={`mb-4 flex items-center gap-2 text-lg font-semibold ${deployResult.success ? "text-green-400" : "text-red-400"
                                        }`}
                                >
                                    {deployResult.success ? (
                                        <CheckCircle2 size={24} />
                                    ) : (
                                        <XCircle size={24} />
                                    )}
                                    {deployResult.message}
                                </div>
                                {deployResult.output && (
                                    <div className="code-block mt-4">
                                        <pre className="whitespace-pre-wrap text-xs text-nova-gray-400">
                                            {deployResult.output}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
