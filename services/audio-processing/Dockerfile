FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies (Amazon Linux compatible)
RUN yum update -y && \
    yum install -y \
        gcc \
        gcc-c++ \
        make \
        ffmpeg \
    && yum clean all && rm -rf /var/cache/yum

# Upgrade Python build tools (fixes pkg_resources error)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --no-build-isolation -r requirements.txt

# (Optional) Preload Whisper model to avoid runtime download
# ⚠️ Increases image size (~150MB+), but improves cold start
# Uncomment if needed:
RUN python -c "import whisper; whisper.load_model('base')"

# Copy application code
COPY app/ ./app/

# Set Lambda handler
CMD ["app.handler.handler"]
