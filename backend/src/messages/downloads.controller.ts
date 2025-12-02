import { Controller, Get, NotImplementedException, Param } from '@nestjs/common';

@Controller('download')
export class DownloadsController {
    @Get(':token')
    download(@Param('token') token: string) {
        throw new NotImplementedException(
            `Download endpoint not yet implemented. Token received: ${token}`,
        );
    }
}
