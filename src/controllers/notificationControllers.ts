import { NotificationModel } from '../models/Notification.js';
import { UserModel } from '../models/User.js';
import mongoose from 'mongoose';

/**
 * Helper function: Tạo notification
 * Được gọi từ các controller khác (like, comment, follow)
 * 
 * @param recipientId - ID người nhận (người sở hữu thread/được follow)
 * @param actorId - ID người tác động (người like/comment/follow)
 * @param type - Loại notification (like, comment, follow, repost, post)
 * @param entityType - Loại entity (user hoặc thread)
 * @param entityId - ID của entity (thread ID hoặc user ID)
 * @param text - Nội dung thêm (optional)
 */
export const createNotification = async (
  recipientId: string,
  actorId: string,
  type: 'follow' | 'like' | 'comment' | 'repost' | 'post',
  entityType: 'user' | 'thread',
  entityId: string,
  text?: string
) => {
  try {
    // Tránh self-notification
    if (recipientId === actorId) {
      console.log('⏭️ Skipping self-notification');
      return null;
    }

    // Kiểm tra IDs có valid không
    if (
      !mongoose.Types.ObjectId.isValid(recipientId) ||
      !mongoose.Types.ObjectId.isValid(actorId) ||
      !mongoose.Types.ObjectId.isValid(entityId)
    ) {
      throw new Error('Invalid ObjectId');
    }

    // Tạo notification mới
    const notification = await NotificationModel.create({
      recipientId: new mongoose.Types.ObjectId(recipientId),
      actorId: new mongoose.Types.ObjectId(actorId),
      type,
      entityType,
      entityId: new mongoose.Types.ObjectId(entityId),
      text: text || undefined,
      readAt: null,
    });

    console.log(`✅ Notification created: ${type} from ${actorId} to ${recipientId}`);

    return notification;
  } catch (error) {
    console.error('❌ Create notification error:', error);
    throw error;
  }
};

/**
 * Lấy thống kê số notification chưa đọc
 */
export const getUnreadCount = async (userId: string): Promise<number> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return 0;
    }

    const count = await NotificationModel.countDocuments({
      recipientId: new mongoose.Types.ObjectId(userId),
      readAt: null,
    });

    return count;
  } catch (error) {
    console.error('Get unread count error:', error);
    return 0;
  }
};

/**
 * Lấy danh sách notification cho user
 */
export const getUserNotifications = async (userId: string, limit: number = 30) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return [];
    }

    const meId = new mongoose.Types.ObjectId(userId);

    const items = await NotificationModel.find({ recipientId: meId })
      .sort({ createdAt: -1 })
      .limit(Math.min(50, Math.max(1, limit)));

    // Lấy thông tin actor
    const actorIds = Array.from(new Set(items.map((n) => String(n.actorId))));
    const actors = await UserModel.find({ _id: { $in: actorIds } });
    const actorMap = new Map(actors.map((a) => [String(a._id), a]));

    return items.map((n) => {
      const actor = actorMap.get(String(n.actorId));
      return {
        id: String(n._id),
        type: n.type,
        entityType: n.entityType,
        entityId: String(n.entityId),
        text: n.text ?? '',
        createdAt: n.createdAt,
        readAt: n.readAt,
        actor: {
          uid: String(n.actorId),
          displayName: actor?.displayName ?? 'GymBro User',
          photoURL: actor?.photoURL ?? '',
        },
      };
    });
  } catch (error) {
    console.error('Get user notifications error:', error);
    return [];
  }
};