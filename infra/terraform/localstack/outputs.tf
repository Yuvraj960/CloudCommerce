output "s3_bucket_name" {
  description = "Name of the product images S3 bucket"
  value       = aws_s3_bucket.product_images.bucket
}

output "s3_bucket_arn" {
  description = "ARN of the product images S3 bucket"
  value       = aws_s3_bucket.product_images.arn
}

output "s3_bucket_endpoint" {
  description = "Endpoint URL for the S3 bucket (path-style for LocalStack)"
  value       = "${var.localstack_endpoint}/${var.s3_bucket_name}"
}

output "sns_topic_arn" {
  description = "ARN of the SNS order notifications topic"
  value       = aws_sns_topic.order_notifications.arn
}

output "sns_topic_name" {
  description = "Name of the SNS order notifications topic"
  value       = aws_sns_topic.order_notifications.name
}

output "sqs_queue_url" {
  description = "URL of the SQS order queue"
  value       = aws_sqs_queue.order_queue.url
}

output "sqs_queue_arn" {
  description = "ARN of the SQS order queue"
  value       = aws_sqs_queue.order_queue.arn
}