variable "aws_region" {
  description = "AWS region for LocalStack resources"
  type        = string
  default     = "us-east-1"
}

variable "aws_access_key" {
  description = "AWS access key for LocalStack (test account)"
  type        = string
  default     = "test"
  sensitive   = true
}

variable "aws_secret_key" {
  description = "AWS secret key for LocalStack (test account)"
  type        = string
  default     = "test"
  sensitive   = true
}

variable "localstack_endpoint" {
  description = "LocalStack service endpoint URL. Defaults to Docker Compose URL. Override for Kind deployment."
  type        = string
  default     = "http://localhost:4566"
}

variable "s3_bucket_name" {
  description = "Name of the S3 bucket for product images"
  type        = string
  default     = "cloudcommerce-images"
}

variable "sns_topic_name" {
  description = "Name of the SNS topic for order notifications"
  type        = string
  default     = "cloudcommerce-orders"
}

variable "sqs_queue_name" {
  description = "Name of the SQS queue for order processing"
  type        = string
  default     = "cloudcommerce-order-queue"
}