import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CheckOwnership } from '../../../common/decorators/check-ownership.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { BadRequestException } from '../../../common/exceptions/custom-exceptions';

@ApiTags('Files')
@ApiBearerAuth('JWT')
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @RequirePermissions('files:upload')
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a file owned by the current account' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'The stored file record.' })
  @ApiResponse({ status: 400, description: 'Missing file field or file too large.' })
  async upload(
    @CurrentUser('id') accountId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('file field is required');
    return this.filesService.upload({
      ownerAccountId: accountId,
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @RequirePermissions('files:read:own')
  @Get('me')
  @ApiOperation({ summary: 'List the current account files' })
  @ApiResponse({ status: 200, description: 'The files owned by the current account.' })
  listOwn(@CurrentUser('id') accountId: string) {
    return this.filesService.listOwn(accountId);
  }

  @RequirePermissions('files:read:own')
  @CheckOwnership({ resource: 'file', param: 'id' })
  @Get(':id/download')
  @ApiOperation({ summary: 'Presigned GET URL for downloading the file (own only)' })
  @ApiResponse({ status: 200, description: 'A short-lived presigned download URL.' })
  @ApiResponse({ status: 404, description: 'File not found.' })
  download(@Param('id') id: string) {
    return this.filesService.getDownloadUrl(id);
  }

  @RequirePermissions('files:delete:own')
  @CheckOwnership({ resource: 'file', param: 'id' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a file (own only)' })
  @ApiResponse({ status: 204, description: 'File deleted.' })
  @ApiResponse({ status: 404, description: 'File not found.' })
  async remove(@Param('id') id: string) {
    await this.filesService.remove(id);
  }
}
