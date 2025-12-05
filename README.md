# Stampee Technical Assignment

## Overview

Welcome to the Stampee technical assessment. Your task is to build a backend system for sending secure messages with attachments to multiple recipients via email.

## Project Description

Build a message distribution system where users can compose messages, attach files, and send them to multiple email recipients. Recipients receive an email notification with a secure link to download the message content and all attachments as a single ZIP archive.

## Core Requirements

### Message Composition

Create an endpoint that accepts a message with the following properties:

- Subject line (required, maximum 200 characters)
- Message body (required, plain text format)
- List of recipient email addresses (required, minimum 1 recipient)
- File attachments (optional, up to 10 files)

The system should automatically deduplicate recipient email addresses and validate that all emails are in proper format.

### File Upload Management

- Support multiple file uploads per message
- Maximum 10 files per message
- Total combined file size limit of 256MB per message
- Store files securely with proper access controls
- Support common file types: PDF, DOCX, XLSX, PPTX, TXT, PNG, JPG, JPEG

### Email Delivery System

Send email notifications to all recipients when a message is sent. Each email should contain:

- Sender email address
- Message subject
- Message body (full content or preview)
- Secure download link unique to each recipient

The system should handle email delivery failures gracefully and use a queue-based approach for reliability.

### Download System

- Generate secure, time-limited download links for recipients
- Each link should be unique per recipient
- Create ZIP archives on-demand containing:
  - A text file with the message content (subject and body)
  - All attached files with their original filenames
- Links should expire after 48 hours

## Technical Requirements

### Backend Stack

- Framework: Node.js with Express, Fastify, or AdonisJS or any other server of Server/Framework of your choice
- Language: TypeScript strongly recommended
- Validation: Comprehensive input validation using Zod, Joi, or Vine
- API Design: RESTful endpoints with proper HTTP status codes and error handling

### Database

- Choose any database that fits your design: PostgreSQL, MySQL, MongoDB, SQLite
- Design your own schema to support the required functionality
- Implement proper relationships between entities
- Consider indexes for performance

### File Storage

- Local filesystem storage with organized directory structure Or cloud storage solution (S3, MinIO, etc.)

### Email Service

- Use a test/sandbox mode for the email service like Maildev
- Handle email failures with appropriate error responses
- Emails should be able to be dispatched asynchronously 

### Current Setup

We have provided a quick start template where you can execute `task dev` to launch the backend server. The current setup uses Node.js with Fastify and TypeScript. Feel free to modify the stack as needed, but document your choices in your submission.

## API Requirements

Design and implement the following endpoints:

### Message Endpoints

- `POST /api/messages` - Create and send a new message
  - Accept message data and file uploads
  - Validate and store attachments
  - Queue emails for delivery
  
- `POST /api/messages/:id/attachments` - Upload files to a message (before sending)
  - Accept file uploads
  - Validate file type and size

- Implement any other endpoint that you deem reasonable to use

### Download Endpoint

- `GET /api/download/:token` - Download message as ZIP
  - Public endpoint that validates the download token
  - Generate ZIP file with message content and attachments
  - Stream the ZIP file to the client
  - Track download for the recipient
  - Update the status of the message to **received**

## Validation Requirements

### Message Creation

- Subject: Required, 1-200 characters
- Body: Required, 1-10000 characters
- Recipients: Required, minimum 1 valid email address
- Email addresses must be valid format and automatically deduplicated

### File Upload

- Maximum 10 files per message
- Total size across all files must not exceed 256MB

## What we expect from you

- Fully dockerized application that can run using docker-compose up
- Asynchronous sending of the emails
- Virus/malware scanning for uploaded files (ClamAV integration or any other tool of your choice)
- App that can be stress tested
- Unit tests

## Bonus Features

Implement these if you finish the core requirements and have extra time:

- Minimalistic frontend with fields to input emails, Subject and files to send to multiple recipients with vue3/React or any framework of your choice.
- Validate file types and sizes before storage
- Login users and perform actions while authenticated.
- Logging system with different severity levels
- Caching layer for frequently accessed data (Redis)


## Time Expectation

This assessment is designed to take approximately 6-10 hours to complete. Focus on implementing core functionality, then add bonus features if time permits.

The goal is to evaluate:

- Your architectural decision-making
- Code quality and organization
- API design skills
- Security awareness
- Problem-solving approach
- Ability to build production-ready features

## Getting Started

### Prerequisites

- Node.js 20 or higher
- pnpm (install with `npm install -g pnpm`)
- Docker and Docker Compose

### Installation

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Start all services with Docker**
   ```bash
   docker-compose up -d
   ```

   This will start:
   - Backend API on `http://localhost:3000`
   - Maildev UI on `http://localhost:1080` (SMTP on port 1025)
   - ClamAV on `localhost:3310`

3. **Verify the setup**
   ```bash
   # Test health endpoint
   curl http://localhost:3000/health
   
   # Test hello world endpoint
   curl http://localhost:3000/api/hello
   ```

## Questions

If you have any questions about the requirements or need clarification on any aspect of the assessment, please reach out to us. We're here to help ensure you understand what's expected.

Good luck, and we look forward to reviewing your solution!

# Rendu

## Démarrage
- Prérequis : Docker + Docker Compose. Node 20 / pnpm
- Copier `backend/.env.example` vers `backend/.env`, copier `frontend/.env.example` vers `frontend/.env`et ajuster si besoin (ce fichier est surtout utile hors Docker, les variables par défaut sont déjà dans `docker-compose.yml`).
- Installer les dépendances : `pnpm install`.
- Lancer la stack complète (API Nest, front Next, MySQL, Redis, Maildev, ClamAV, phpMyAdmin) : `docker compose up --build`.
- Points d’entrée : API http://localhost:3000 (health + routes `/api/messages`, `/api/download/:token`), front http://localhost:3001, Maildev http://localhost:1080, phpMyAdmin http://localhost:8081. En local hors Docker : `pnpm --filter backend dev` et `pnpm --filter frontend dev` (penser à fournir MySQL/Redis/ClamAV).

## Choix d’architecture
- Monorepo pnpm + docker-compose pour démarrer en quelques commandes avec les mêmes dépendances (API, front, MySQL, Redis, ClamAV, Maildev) sur tous les OS.
- NestJS + TypeScript pour une structure modulaire (messages, downloads) et des DTO validés avec Zod. TypeORM + MySQL pour le relationnel (messages, destinataires, pièces jointes) avec migrations ; (Prisma était possible, préférence subjective pour TypeORM)
- Upload pipeline : Multer en mémoire → scan ClamAV → écriture disque → ZIP streaming à la demande (archiver) avec un token de téléchargement unique par destinataire et une expiration configurable.
- Envoi des emails asynchrone via BullMQ + Redis ; un worker dans le même service distribue les notifications via Nodemailer/Maildev et met à jour les statuts.
- Protection et perf : rate limiting en middleware, whitelist d’extensions, limite de poids total, déduplication des destinataires, cache Redis pour les snapshots de messages.
- Front Next.js 14 + Tailwind, stack demandée dans l'exercice et largement adoptée, je crois beaucoup en son potentiel dans l'industrie. Création de message avec pièces jointes, affichage des tokens, polling du statut.

## Limitations et améliorations possibles
- Authentification/autorisation inexistantes : à ajouter (JWT/OIDC) avec rôles et audit trails. CORS/headers de sécurité à durcir.
- File storage : passer sur S3/MinIO avec liens signés et cycle de vie, chiffrement au repos et nettoyage des répertoires expirés.
- File scanning : gérer les pannes ClamAV (circuit breaker, file de quarantaine) et journaliser les signatures.
- File delivery : séparer le worker BullMQ dans un service dédié, ajouter de l’idempotence et du monitoring (retries, DLQ).
- Observabilité : métriques/alerting (Prometheus/Grafana).
- Front : pré-validation des fichiers (type/poids), retours d’erreur plus détaillés, visualisation des téléchargements, tests de composants.
- Tests : compléter par des tests unitaires (services/worker/mail) et des scénarios de résilience (timeouts SMTP/Redis/MySQL).

## Ressources utilisées
- Documentation : BullMQ, Nodemailer, Archiver, ClamAV & Redis principalement.
- Assistants IA : ChatGPT Codex CLI pour du scaffolding côté back et des vérifications ponctuelles, Claude Code pour générer du code côté front
- Outils : Node.js 20 et pnpm, Docker / Docker Compose, Maildev pour l’email, Redis CLI, mysqlclient/phpMyAdmin pour inspecter la base, Vitest + Supertest pour les tests e2e, ESLint/Prettier pour la qualité du code.
