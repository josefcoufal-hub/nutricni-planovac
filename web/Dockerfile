# Webová vrstva (Node.js + sestavený frontend). Kontext sestavení: KOŘEN repozitáře
#   docker build -f web/Dockerfile -t planovac-web .
FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend ./frontend
RUN mkdir -p web/public && node frontend/build.js --server

FROM node:22-alpine
ENV NODE_ENV=production APP_ENV=production PORT=8080
WORKDIR /app
COPY web/package.json ./
COPY web/src ./src
COPY --from=frontend /src/web/public ./public
USER node
EXPOSE 8080
CMD ["node", "src/index.js"]
