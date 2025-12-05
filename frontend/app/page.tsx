"use client";

import { useMemo, useState } from 'react';
import { useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';
const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

type CreatedMessage = {
    id: string;
    subject: string;
    status: string;
    recipients: { email: string; downloadToken: string; status: string }[];
    attachments: { id: string; name: string; size: number; mimeType: string }[];
    createdAt: string;
};
type MessageDetails = CreatedMessage & {
    body?: string;
    recipients: {
        email: string;
        downloadToken: string;
        status: string;
        expiresAt?: string;
        downloadedAt?: string | null;
    }[];
};

const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const parseRecipients = (raw: string) => {
    const list = raw
        .split(/[\n,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((email) => email.toLowerCase());
    return Array.from(new Set(list));
};

const downloadBase = API_BASE.replace(/\/api$/, '');

export default function Page() {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [recipientsText, setRecipientsText] = useState('');
    const [files, setFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState<CreatedMessage | null>(null);
    const [live, setLive] = useState<MessageDetails | null>(null);

    const recipients = useMemo(() => parseRecipients(recipientsText), [recipientsText]);
    const totalSize = useMemo(() => files.reduce((acc, file) => acc + file.size, 0), [files]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(event.target.files ?? []);
        if (selected.length > MAX_FILES) {
            setError(`Maximum ${MAX_FILES} fichiers autorisés.`);
            return;
        }
        const newTotal = selected.reduce((acc, file) => acc + file.size, 0);
        if (newTotal > MAX_TOTAL_BYTES) {
            setError('Poids total supérieur à 256MB.');
            return;
        }
        setError(null);
        setFiles(selected);
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setCreated(null);

        if (!subject.trim() || !body.trim()) {
            setError('Sujet et contenu sont requis.');
            return;
        }

        if (recipients.length === 0) {
            setError('Ajoute au moins un destinataire.');
            return;
        }

        if (files.length > MAX_FILES) {
            setError(`Maximum ${MAX_FILES} fichiers autorisés.`);
            return;
        }

        if (totalSize > MAX_TOTAL_BYTES) {
            setError('Poids total supérieur à 256MB.');
            return;
        }

        setIsSubmitting(true);
        try {
            const form = new FormData();
            form.set('subject', subject.trim());
            form.set('body', body.trim());
            form.set('recipients', JSON.stringify(recipients));
            files.forEach((file) => form.append('attachments', file));

            const response = await fetch(`${API_BASE}/messages`, {
                method: 'POST',
                body: form,
            });

            const payload = await response.json();
            if (!response.ok) {
                const issues = payload?.issues
                    ? payload.issues.map((i: { message: string }) => i.message).join(', ')
                    : payload?.message;
                throw new Error(issues || 'Impossible de créer le message');
            }

            const message = payload as CreatedMessage;
            setCreated(message);
            setLive(message);
            // Start an immediate refresh
            void refreshStatus(message.id);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erreur inconnue';
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const refreshStatus = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/messages/${id}`);
            if (!res.ok) return;
            const payload = (await res.json()) as MessageDetails;
            setLive(payload);
        } catch (e) {
            console.warn('Failed to refresh status', e);
        }
    };

    // Poll every 5s while we have a created message not yet sent/received
    useEffect(() => {
        if (!created) return;
        const unsettled = new Set(['pending', 'queued', 'sent']);
        if (!unsettled.has(live?.status ?? created.status)) {
            return;
        }

        const id = created.id;
        const interval = setInterval(() => void refreshStatus(id), 5000);
        return () => clearInterval(interval);
    }, [created, live?.status]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-mist via-white to-mist">
            <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12">
                <header className="flex flex-col gap-3">
                    <p className="text-sm font-semibold tracking-wide text-accent uppercase">
                        Stampee — Sandbox
                    </p>
                    <h1 className="text-3xl font-semibold text-ink">Envoyer un message sécurisé</h1>
                    <p className="text-slate-600 max-w-3xl">
                        Renseigne le sujet, le corps du message, les destinataires et les pièces
                        jointes. L&apos;API retournera des liens de téléchargement uniques par
                        destinataire.
                    </p>
                </header>

                <main className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <section className="card lg:col-span-2 p-6">
                        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                            <div className="flex flex-col gap-2">
                                <label className="label" htmlFor="subject">
                                    Sujet
                                </label>
                                <input
                                    id="subject"
                                    className="input"
                                    placeholder="Objet du message"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    required
                                    maxLength={200}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="label" htmlFor="body">
                                    Contenu
                                </label>
                                <textarea
                                    id="body"
                                    className="input h-36 resize-none"
                                    placeholder="Tape ton message..."
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    required
                                    maxLength={10000}
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <label className="label" htmlFor="recipients">
                                        Destinataires
                                    </label>
                                    <span className="text-xs text-slate-500">
                                        Séparés par virgule, point-virgule ou retour à la ligne
                                    </span>
                                </div>
                                <textarea
                                    id="recipients"
                                    className="input h-28 resize-none"
                                    placeholder="alice@example.com, bob@example.com"
                                    value={recipientsText}
                                    onChange={(e) => setRecipientsText(e.target.value)}
                                    required
                                />
                                {recipients.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {recipients.map((email) => (
                                            <span className="pill" key={email}>
                                                {email}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <label className="label" htmlFor="attachments">
                                        Pièces jointes
                                    </label>
                                    <span className="text-xs text-slate-500">
                                        Max {MAX_FILES} fichiers · Total &lt; 256MB
                                    </span>
                                </div>
                                <input
                                    id="attachments"
                                    type="file"
                                    multiple
                                    onChange={handleFileChange}
                                    className="input cursor-pointer"
                                />
                                {files.length > 0 && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                        <div className="flex items-center justify-between">
                                            <span>{files.length} fichier(s) sélectionné(s)</span>
                                            <span className="font-medium">{formatBytes(totalSize)}</span>
                                        </div>
                                        <ul className="mt-2 space-y-1 text-xs text-slate-600">
                                            {files.map((file) => (
                                                <li key={file.name} className="flex items-center justify-between">
                                                    <span className="truncate">{file.name}</span>
                                                    <span>{formatBytes(file.size)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {error}
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-4">
                                <div className="text-xs text-slate-500">
                                    API: <code className="text-ink">{API_BASE}</code>
                                </div>
                                <button className="button" type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? 'Envoi en cours...' : 'Envoyer'}
                                </button>
                            </div>
                        </form>
                    </section>

                    <aside className="card p-6 flex flex-col gap-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-semibold text-ink">Statut</p>
                                <p className="text-xs text-slate-500">
                                    Aperçu de la réponse de l&apos;API.
                                </p>
                            </div>
                            <span className="pill">
                                {isSubmitting ? 'En cours' : created ? 'OK' : 'En attente'}
                            </span>
                        </div>

                        {(live ?? created) ? (
                            <div className="flex flex-col gap-3">
                                <div>
                                    <p className="text-sm font-semibold">{(live ?? created)?.subject}</p>
                                    <p className="text-xs text-slate-500">
                                        Message #{(live ?? created)?.id} · {(live ?? created)?.status}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <p className="label">Destinataires</p>
                                    <ul className="space-y-2">
                                        {(live ?? created)?.recipients.map((recipient) => (
                                            <li key={recipient.email} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium">{recipient.email}</span>
                                                    <span className="pill">{recipient.status}</span>
                                                </div>
                                                <div className="mt-1 text-xs text-slate-500 break-all">
                                                    Lien: {downloadBase}/api/download/{recipient.downloadToken}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {(live ?? created)?.attachments?.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        <p className="label">Pièces jointes</p>
                                        <ul className="space-y-1 text-sm text-slate-700">
                                            {(live ?? created)?.attachments.map((att) => (
                                                <li
                                                    key={att.id}
                                                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
                                                >
                                                    <span className="truncate">{att.name}</span>
                                                    <span className="text-xs text-slate-500">
                                                        {formatBytes(att.size)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-sm text-slate-600">
                                Tu verras ici les tokens de téléchargement dès que l&apos;API aura accepté la
                                requête.
                            </div>
                        )}
                    </aside>
                </main>
            </div>
        </div>
    );
}
