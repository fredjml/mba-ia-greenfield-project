import {
  applyDecorators,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { InitVideoUploadDto } from './dto/init-video-upload.dto';
import { InitVideoUploadResponseDto } from './dto/init-video-upload-response.dto';
import { VideoDetailsResponseDto } from './dto/video-details-response.dto';
import { VideoUploadStatusResponseDto } from './dto/video-upload-status-response.dto';
import { VideosService } from './videos.service';

const VIDEO_ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Request validation failed',
  401: 'Missing or invalid access token',
  404: 'Video or owner channel was not found',
  409: 'Video state does not allow this operation',
  413: 'Video file exceeds the upload limit',
  416: 'Requested byte range is invalid or unsatisfiable',
  429: 'Request rate limit exceeded',
  502: 'Storage or processing queue operation failed',
};

function ApiVideoErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: VIDEO_ERROR_DESCRIPTIONS[status],
        content: {
          'application/json': {
            schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
          },
        },
      }),
    ),
  );
}

@ApiTags('videos')
@ApiBearerAuth('access-token')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get(':slug/stream')
  @ApiOperation({ summary: 'Stream a ready video with optional byte range' })
  @ApiHeader({
    name: 'Range',
    required: false,
    description: 'Single byte range, for example bytes=0-1048575',
  })
  @ApiProduces('video/mp4', 'video/webm', 'application/octet-stream')
  @ApiResponse({
    status: 200,
    description: 'Complete original video stream',
    content: {
      'video/mp4': {
        schema: { type: 'string', format: 'binary' },
      },
      'video/webm': {
        schema: { type: 'string', format: 'binary' },
      },
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
    headers: {
      'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
      'Content-Length': { schema: { type: 'integer' } },
    },
  })
  @ApiResponse({
    status: 206,
    description: 'Requested byte range of the original video',
    content: {
      'video/mp4': {
        schema: { type: 'string', format: 'binary' },
      },
      'video/webm': {
        schema: { type: 'string', format: 'binary' },
      },
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
    headers: {
      'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
      'Content-Range': {
        schema: { type: 'string', example: 'bytes 0-1023/4096' },
      },
      'Content-Length': { schema: { type: 'integer' } },
    },
  })
  @ApiVideoErrors(401, 404, 409, 416, 429, 502)
  async streamVideo(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const content = await this.videosService.streamVideo(
      user.sub,
      slug,
      rangeHeader,
    );
    response.status(content.statusCode);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Length', String(content.contentLength));
    if (content.contentRange) {
      response.setHeader('Content-Range', content.contentRange);
    }
    return new StreamableFile(content.stream);
  }

  @Get(':slug/download')
  @ApiOperation({ summary: 'Download a ready original video' })
  @ApiProduces('video/mp4', 'video/webm', 'application/octet-stream')
  @ApiResponse({
    status: 200,
    description: 'Original video attachment',
    content: {
      'video/mp4': {
        schema: { type: 'string', format: 'binary' },
      },
      'video/webm': {
        schema: { type: 'string', format: 'binary' },
      },
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
    headers: {
      'Content-Disposition': {
        schema: {
          type: 'string',
          example: 'attachment; filename="video-slug.mp4"',
        },
      },
      'Content-Length': { schema: { type: 'integer' } },
    },
  })
  @ApiVideoErrors(401, 404, 409, 429, 502)
  async downloadVideo(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const content = await this.videosService.downloadVideo(user.sub, slug);
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Length', String(content.contentLength));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${content.filename}"`,
    );
    return new StreamableFile(content.stream);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get an owned video and its processing status' })
  @ApiOkResponse({ type: VideoDetailsResponseDto })
  @ApiVideoErrors(401, 404, 429)
  getBySlug(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<VideoDetailsResponseDto> {
    return this.videosService.getBySlug(user.sub, slug);
  }

  @Post('uploads/init')
  @ApiOperation({ summary: 'Initialize a multipart video upload' })
  @ApiCreatedResponse({ type: InitVideoUploadResponseDto })
  @ApiVideoErrors(400, 401, 404, 413, 429, 502)
  initUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitVideoUploadDto,
  ): Promise<InitVideoUploadResponseDto> {
    return this.videosService.initUpload(user.sub, dto);
  }

  @Post(':id/uploads/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a multipart video upload' })
  @ApiOkResponse({ type: VideoUploadStatusResponseDto })
  @ApiVideoErrors(400, 401, 404, 409, 429, 502)
  completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
    @Body() dto: CompleteVideoUploadDto,
  ): Promise<VideoUploadStatusResponseDto> {
    return this.videosService.completeUpload(user.sub, videoId, dto);
  }

  @Post(':id/uploads/abort')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Abort a multipart video upload' })
  @ApiResponse({ status: 204, description: 'Multipart upload aborted' })
  @ApiVideoErrors(401, 404, 409, 429, 502)
  async abortUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
  ): Promise<void> {
    await this.videosService.abortUpload(user.sub, videoId);
  }
}
