FROM cgr.dev/chainguard/node:latest
ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node . .
RUN npm ci
EXPOSE 3000
ENTRYPOINT ["node", "server.js"]