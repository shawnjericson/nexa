import { AppError } from '../../../shared/errors/app-error';

export const ChatErrors = {
  // Private conversations of others are reported as missing, never as forbidden.
  conversationNotFound: () => new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found'),
  joinRequired: () =>
    new AppError(403, 'JOIN_REQUIRED', 'Join this channel to read or send messages'),
  conversationArchived: () =>
    new AppError(409, 'CONVERSATION_ARCHIVED', 'This conversation is archived'),
  managementForbidden: () =>
    new AppError(
      403,
      'CONVERSATION_MANAGEMENT_FORBIDDEN',
      'Only the owners and admins of this conversation can do this',
    ),
  directConversationFixed: () =>
    new AppError(
      400,
      'DIRECT_CONVERSATION_FIXED',
      'The members and settings of a direct conversation cannot change',
    ),
  invalidDirectPeer: () =>
    new AppError(400, 'INVALID_DIRECT_PEER', 'Choose someone other than yourself'),
  participantNotFound: () =>
    new AppError(
      404,
      'PARTICIPANT_NOT_FOUND',
      'Some of these people are not active members of the organization',
    ),
  memberNotFound: () =>
    new AppError(404, 'CONVERSATION_MEMBER_NOT_FOUND', 'This person is not in the conversation'),
  channelCreateForbidden: () =>
    new AppError(403, 'PERMISSION_DENIED', 'This action requires the "channel.create" permission'),
  channelExists: () =>
    new AppError(409, 'CHANNEL_EXISTS', 'A channel with this name already exists'),
  invalidChannelName: () =>
    new AppError(400, 'INVALID_CHANNEL_NAME', 'Channel names must contain letters or digits'),
  messageNotFound: () => new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found'),
  replyTargetNotFound: () =>
    new AppError(
      404,
      'REPLY_TARGET_NOT_FOUND',
      'The message you are replying to is not in this conversation',
    ),
  messageEditForbidden: () =>
    new AppError(403, 'MESSAGE_EDIT_FORBIDDEN', 'Only the sender can edit this message'),
  messageDeleteForbidden: () =>
    new AppError(403, 'MESSAGE_DELETE_FORBIDDEN', 'You cannot delete this message'),
};
