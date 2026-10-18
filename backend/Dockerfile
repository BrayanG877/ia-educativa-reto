# =============================================================
# Dockerfile de producción — IA Educativa
# Ubicación: backend/Dockerfile
#
# Build desde la raíz:
# docker build -f backend/Dockerfile -t claurst-ia-educativa:fase1 .
#
# Destino:
# AWS Elastic Beanstalk / Docker
# =============================================================

FROM node:20-alpine AS deps

# Dependencias necesarias para instalar paquetes
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++

WORKDIR /app

# El package.json y package-lock están dentro de backend/
COPY backend/package.json backend/package-lock.json ./

# Instalar únicamente dependencias de producción
RUN npm ci --omit=dev && \
    npm cache clean --force


# =============================================================
# Imagen final
# =============================================================

FROM node:20-alpine AS production

RUN apk add --no-cache \
    openssl \
    ca-certificates \
    dumb-init

# Usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeapp -u 1001 -G nodejs

WORKDIR /app

# Copiar dependencias ya instaladas
COPY --from=deps --chown=nodeapp:nodejs /app/node_modules ./node_modules

# Archivos del backend
COPY --chown=nodeapp:nodejs backend/package.json ./
COPY --chown=nodeapp:nodejs backend/src ./src
COPY --chown=nodeapp:nodejs backend/database ./database

# Frontend
COPY --chown=nodeapp:nodejs web ./web

# Usuario de ejecución
USER nodeapp

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=8080
ENV FRONTEND_PATH=/app/web

EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "\
require('http').get(\
  'http://localhost:' + (process.env.PORT || 8080) + '/health',\
  function(r){ process.exit(r.statusCode === 200 ? 0 : 1) }\
).on('error', function(){ process.exit(1) })"

# Arranque
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
