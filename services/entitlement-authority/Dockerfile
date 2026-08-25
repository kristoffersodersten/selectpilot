FROM node:22-alpine
WORKDIR /app
COPY services/entitlement-authority/server.mjs ./server.mjs
USER node
ENV HOST=0.0.0.0 PORT=8090
EXPOSE 8090
CMD ["node", "server.mjs"]
