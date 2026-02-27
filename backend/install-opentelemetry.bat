@echo off
echo Instalando dependencias OpenTelemetry...
npm install @opentelemetry/api@^1.9.0 @opentelemetry/auto-instrumentations-node@^0.52.1 @opentelemetry/exporter-jaeger@^1.28.0 @opentelemetry/exporter-prometheus@^0.56.0 @opentelemetry/instrumentation@^0.56.0 @opentelemetry/resources@^1.28.0 @opentelemetry/sdk-metrics@^1.28.0 @opentelemetry/sdk-node@^0.56.0 @opentelemetry/sdk-trace-node@^1.28.0 @opentelemetry/semantic-conventions@^1.28.0
echo.
echo Instalacao concluida!
pause
