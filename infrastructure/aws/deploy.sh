#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# A to Z Routes — AWS Deployment Script
# Prerequisites: aws-cli v2, jq
# Usage: ./deploy.sh [region] [environment]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REGION=${1:-ap-south-1}
ENV=${2:-prod}
APP="atozroutes"
CLUSTER="${APP}-${ENV}"

echo "🚀 Deploying A to Z Routes to AWS ${REGION} (${ENV})"
echo "────────────────────────────────────────────────────"

# ── 1. Create ECR repositories ────────────────────────────────────────────────
echo "📦 Creating ECR repositories..."
for repo in backend frontend; do
  aws ecr describe-repositories --repository-names "${APP}-${repo}" \
      --region "${REGION}" >/dev/null 2>&1 || \
  aws ecr create-repository \
      --repository-name "${APP}-${repo}" \
      --image-scanning-configuration scanOnPush=true \
      --region "${REGION}"
  echo "   ✓ ${APP}-${repo}"
done

# ── 2. Create ECS cluster ─────────────────────────────────────────────────────
echo "🖥  Creating ECS cluster: ${CLUSTER}..."
aws ecs create-cluster \
    --cluster-name "${CLUSTER}" \
    --capacity-providers FARGATE FARGATE_SPOT \
    --default-capacity-provider-strategy \
        capacityProvider=FARGATE,weight=1 \
        capacityProvider=FARGATE_SPOT,weight=3 \
    --region "${REGION}" \
    --output text --query 'cluster.clusterArn' 2>/dev/null || echo "   Cluster already exists"

# ── 3. Create CloudWatch log groups ───────────────────────────────────────────
echo "📋 Creating CloudWatch log groups..."
for svc in backend frontend nginx; do
  aws logs create-log-group \
      --log-group-name "/ecs/${APP}-${svc}" \
      --region "${REGION}" 2>/dev/null || true
  aws logs put-retention-policy \
      --log-group-name "/ecs/${APP}-${svc}" \
      --retention-in-days 30 \
      --region "${REGION}" 2>/dev/null || true
  echo "   ✓ /ecs/${APP}-${svc} (30d retention)"
done

# ── 4. Register task definitions ──────────────────────────────────────────────
echo "📝 Registering ECS task definitions..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
sed "s/ACCOUNT_ID/${ACCOUNT_ID}/g" ecs-backend-task.json > /tmp/ecs-backend-task.json
aws ecs register-task-definition \
    --cli-input-json file:///tmp/ecs-backend-task.json \
    --region "${REGION}" \
    --output text --query 'taskDefinition.taskDefinitionArn'
echo "   ✓ Backend task definition registered"

# ── 5. Create/update ECS services ─────────────────────────────────────────────
echo "⚙️  Updating ECS services..."
for svc in backend frontend; do
  SERVICE_EXISTS=$(aws ecs describe-services \
      --cluster "${CLUSTER}" \
      --services "${APP}-${svc}" \
      --region "${REGION}" \
      --query 'services[0].status' \
      --output text 2>/dev/null || echo "MISSING")

  if [ "${SERVICE_EXISTS}" = "ACTIVE" ]; then
    aws ecs update-service \
        --cluster "${CLUSTER}" \
        --service "${APP}-${svc}" \
        --force-new-deployment \
        --region "${REGION}" \
        --output text --query 'service.serviceArn'
    echo "   ✓ Updated ${APP}-${svc}"
  else
    echo "   ⚠️  Service ${APP}-${svc} not found — create via AWS Console or CDK"
  fi
done

# ── 6. Wait for services ──────────────────────────────────────────────────────
echo "⏳ Waiting for services to stabilize..."
aws ecs wait services-stable \
    --cluster "${CLUSTER}" \
    --services "${APP}-backend" \
    --region "${REGION}" 2>/dev/null && echo "   ✓ Backend stable" || echo "   ⚠️  Backend wait timed out"

# ── 7. Health check ───────────────────────────────────────────────────────────
echo ""
echo "✅ Deployment complete!"
echo ""
echo "   ECR Backend:  ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${APP}-backend:latest"
echo "   ECR Frontend: ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${APP}-frontend:latest"
echo "   ECS Cluster:  ${CLUSTER}"
echo ""
echo "📋 Next steps:"
echo "   1. Configure RDS PostgreSQL (db.t3.medium)"
echo "   2. Configure ElastiCache Redis (cache.t3.micro)"
echo "   3. Set up Application Load Balancer"
echo "   4. Configure Route 53 + ACM SSL certificate"
echo "   5. Add secrets to AWS Secrets Manager"
echo "   6. Run: aws ecs run-task --cluster ${CLUSTER} (migrate task)"
