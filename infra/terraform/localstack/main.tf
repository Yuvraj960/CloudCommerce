# ── S3 Bucket ───────────────────────────────────────────────────────────────────
# Used by product-service for image uploads
# Bucket is created in LocalStack on first `terraform apply`
resource "aws_s3_bucket" "product_images" {
  bucket = var.s3_bucket_name

  tags = {
    Description = "Product uploaded images bucket"
    ManagedBy   = "terraform"
    Environment = "local"
  }
}

# LocalStack doesn't enforce lifecycle policies automatically —
# keep this as documentation / future-proofing for real AWS
resource "aws_s3_bucket_versioning" "product_images" {
  bucket = aws_s3_bucket.product_images.id

  versioning_configuration {
    status = "Disabled"
  }
}

# ── SNS Topic ──────────────────────────────────────────────────────────────────
#备用 event-bus for order notifications
# K8s infra currently uses Kafka, but this SNS topic is available as an
# alternative / EventBridge bridge. Update notification-service to consume
# SNS as a future improvement if needed.
resource "aws_sns_topic" "order_notifications" {
  name = var.sns_topic_name

  tags = {
    Description = "Order lifecycle events topic"
    ManagedBy   = "terraform"
  }
}

# ── SQS Queue ──────────────────────────────────────────────────────────────────
# Queue for async order processing — an alternative to Kafka
# notification-service can be updated to consume this queue
resource "aws_sqs_queue" "order_queue" {
  name                       = var.sqs_queue_name
  delay_seconds              = 0
  max_message_size           = 262144 # 256 KiB
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 5

  tags = {
    Description = "Order processing queue"
    ManagedBy   = "terraform"
  }
}

# ── SNS → SQS Subscription ────────────────────────────────────────────────────
# Hook up the SQS queue to the SNS topic
resource "aws_sns_topic_subscription" "order_queue_subscription" {
  topic_arn = aws_sns_topic.order_notifications.arn
  endpoint  = aws_sqs_queue.order_queue.arn
  protocol  = "sqs"
}