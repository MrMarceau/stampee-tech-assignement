FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile || pnpm install

COPY backend ./backend

WORKDIR /app/backend

EXPOSE 3000

CMD ["pnpm", "dev"]