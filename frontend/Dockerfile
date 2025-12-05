FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile || pnpm install

COPY frontend ./frontend

EXPOSE 3001

CMD ["pnpm", "dev:frontend"]
