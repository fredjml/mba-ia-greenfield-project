export abstract class DomainException extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EmailAlreadyExistsException extends DomainException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 409, 'Email is already registered');
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }
}

export class EmailNotConfirmedException extends DomainException {
  constructor() {
    super('EMAIL_NOT_CONFIRMED', 403, 'Email address has not been confirmed');
  }
}

export class InvalidTokenException extends DomainException {
  constructor() {
    super('INVALID_TOKEN', 401, 'Token is invalid');
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super('TOKEN_EXPIRED', 401, 'Token has expired');
  }
}

export class TokenReuseDetectedException extends DomainException {
  constructor() {
    super(
      'TOKEN_REUSE_DETECTED',
      401,
      'Token reuse detected — all sessions revoked',
    );
  }
}

export class VideoUploadValidationException extends DomainException {
  constructor(message: string) {
    super('VIDEO_INVALID_UPLOAD', 400, message);
  }
}

export class VideoFileTooLargeException extends DomainException {
  constructor() {
    super('VIDEO_FILE_TOO_LARGE', 413, 'Video file exceeds the upload limit');
  }
}

export class VideoChannelNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_CHANNEL_NOT_FOUND', 404, 'Channel was not found');
  }
}

export class VideoStorageException extends DomainException {
  constructor() {
    super('VIDEO_STORAGE_ERROR', 502, 'Video storage operation failed');
  }
}

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video was not found');
  }
}

export class VideoUploadNotCompleteException extends DomainException {
  constructor() {
    super('VIDEO_UPLOAD_NOT_COMPLETE', 409, 'Video upload cannot be completed');
  }
}

export class VideoUploadAbortedException extends DomainException {
  constructor() {
    super('VIDEO_UPLOAD_ABORTED', 409, 'Video upload was aborted');
  }
}

export class VideoQueueException extends DomainException {
  constructor() {
    super('VIDEO_QUEUE_ERROR', 502, 'Video processing could not be queued');
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 409, 'Video is not ready');
  }
}

export class VideoProcessingFailedException extends DomainException {
  constructor() {
    super('VIDEO_PROCESSING_FAILED', 409, 'Video processing failed');
  }
}

export class VideoInvalidRangeException extends DomainException {
  constructor() {
    super('VIDEO_INVALID_RANGE', 416, 'Video byte range is invalid');
  }
}
