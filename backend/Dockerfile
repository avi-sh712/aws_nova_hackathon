FROM python:3.11-slim

WORKDIR /app

# Install Terraform CLI for validation endpoint
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget unzip gnupg && \
    wget -q https://releases.hashicorp.com/terraform/1.7.5/terraform_1.7.5_linux_amd64.zip && \
    unzip terraform_1.7.5_linux_amd64.zip -d /usr/local/bin/ && \
    rm terraform_1.7.5_linux_amd64.zip && \
    apt-get purge -y wget unzip && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
