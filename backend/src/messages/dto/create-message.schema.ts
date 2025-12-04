import { z } from 'zod';

const recipientsPreprocess = z.preprocess((raw) => {
    if (Array.isArray(raw)) {
        return raw;
    }

    if (typeof raw === 'string') {
        try {
            const maybeArray = JSON.parse(raw);
            if (Array.isArray(maybeArray)) {
                return maybeArray;
            }
        } catch {
            // Fall through to split-based parsing.
        }

        return raw
            .split(/[\n,;]+/)
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    return [];
}, z.array(z.string().email()).min(1, 'At least one recipient is required.'));

export const createMessageSchema = z.object({
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(10000),
    recipients: recipientsPreprocess.transform((list) =>
        Array.from(new Set(list.map((email) => email.toLowerCase()))),
    ),
});

export type CreateMessageDto = z.infer<typeof createMessageSchema>;
