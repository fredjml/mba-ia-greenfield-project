import {
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { InitVideoUploadDto } from './dto/init-video-upload.dto';
import { InitVideoUploadResponseDto } from './dto/init-video-upload-response.dto';
import { VideoDetailsResponseDto } from './dto/video-details-response.dto';
import { VideoUploadStatusResponseDto } from './dto/video-upload-status-response.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@ApiBearerAuth('access-token')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get(':slug/stream')
  @ApiOperation({ summary: 'Stream a ready video with optional byte range' })
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
  getBySlug(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<VideoDetailsResponseDto> {
    return this.videosService.getBySlug(user.sub, slug);
  }

  @Post('uploads/init')
  @ApiOperation({ summary: 'Initialize a multipart video upload' })
  @ApiCreatedResponse({ type: InitVideoUploadResponseDto })
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
  async abortUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
  ): Promise<void> {
    await this.videosService.abortUpload(user.sub, videoId);
  }
}
