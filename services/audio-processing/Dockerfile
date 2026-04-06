FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies
RUN yum update -y && \
    yum install -y \
    gcc \
    g++ \
    make \
    ffmpeg \
    && yum clean all

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Set the handler
CMD ["app.handler"]
