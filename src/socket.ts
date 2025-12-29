import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt, { JwtPayload } from 'jsonwebtoken';

// Quản lý các user đang online
// Map userId -> socketId
const onlineUsers = new Map<string, string>();

/**
 * Khởi tạo Socket.IO server
 * @param httpServer - HTTP server instance từ createServer()
 * @returns Socket.IO Server instance
 */
export const initializeSocket = (httpServer: HTTPServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      // Cho phép frontend kết nối từ localhost:5173
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  /**
   * Middleware: Xác thực JWT token từ client
   * Client phải gửi token trong auth object
   */
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;

    // Nếu không có token, reject connection
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your-secret-key'
      ) as JwtPayload & { sub?: string; id?: string };

      // Lưu userId vào socket data (chuẩn là sub hoặc id)
      socket.data.userId = decoded.sub || decoded.id;

      // Cho phép kết nối
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  /**
   * Event: Khi client kết nối thành công
   */
  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;

    console.log(`✅ User ${userId} connected with socket ${socket.id}`);

    // Lưu user đang online
    onlineUsers.set(userId, socket.id);

    // Broadcast danh sách user online
    // Frontend có thể dùng để hiển thị trạng thái online
    io.emit('online-users', Array.from(onlineUsers.keys()));

    /**
     * Event: Gửi thông báo real-time
     * Controller sẽ gửi event này khi có action (like, comment, follow)
     */
    socket.on('send-notification', (notification) => {
      // Tìm socket ID của người nhận thông báo
      const recipientSocketId = onlineUsers.get(notification.recipientId);

      // Nếu người nhận đang online, gửi thông báo cho họ
      if (recipientSocketId) {
        console.log(
          `📢 Sending notification to ${notification.recipientId}`
        );
        io.to(recipientSocketId).emit('new-notification', notification);
      } else {
        console.log(
          `⏸️ User ${notification.recipientId} is offline, notification saved in DB`
        );
        // Thông báo sẽ vẫn được lưu trong DB
        // User sẽ thấy khi vào lại ứng dụng
      }
    });

    /**
     * Event: Khi client disconnect
     */
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      console.log(`❌ User ${userId} disconnected`);

      // Broadcast danh sách user online mới
      io.emit('online-users', Array.from(onlineUsers.keys()));
    });

    /**
     * Event: Xử lý lỗi
     */
    socket.on('error', (error) => {
      console.error(`Socket error for user ${userId}:`, error);
    });
  });

  return io;
};

/**
 * Export hàm để lấy danh sách user online
 * Có thể dùng cho việc kiểm tra user có online không
 */
export const getOnlineUsers = (): string[] => {
  return Array.from(onlineUsers.keys());
};

/**
 * Export hàm để kiểm tra user có online không
 */
export const isUserOnline = (userId: string): boolean => {
  return onlineUsers.has(userId);
};

export { onlineUsers };