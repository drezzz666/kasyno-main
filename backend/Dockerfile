# -------------------------------------------------------------
# 1. Build stage
# -------------------------------------------------------------
FROM golang:1.26-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build server binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/casino-server ./cmd/server/main.go

# Build admin grant CLI tool
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/bin/grant ./cmd/grant/main.go

# -------------------------------------------------------------
# 2. Production Runner stage (Ultra-lightweight ~25MB image)
# -------------------------------------------------------------
FROM alpine:3.20 AS runner

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata wget

COPY --from=builder /app/bin/casino-server /app/casino-server
COPY --from=builder /app/bin/grant /app/grant

ENV PORT=8080
ENV GIN_MODE=release

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD wget -q --spider http://127.0.0.1:8080/health || exit 1

CMD ["/app/casino-server"]
