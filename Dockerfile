# Express API + Prisma
FROM node:22-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN npm ci
COPY src ./src
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# Apply pending migrations, then start
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
