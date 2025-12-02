import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
    constructor(private readonly schema: ZodSchema) {}

    transform(value: unknown, _metadata: ArgumentMetadata) {
        const result = this.schema.safeParse(value);

        if (!result.success) {
            const issues = result.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                message: issue.message,
            }));

            throw new BadRequestException({
                error: 'Validation failed',
                issues,
            });
        }

        return result.data;
    }
}
