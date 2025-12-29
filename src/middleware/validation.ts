import { body, ValidationChain, validationResult } from 'express-validator';
import type { RequestHandler } from 'express';

/**
 * Middleware để validate request
 */
export const validate = (validations: ValidationChain[]): RequestHandler => {
  return async (req, res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    next();
  };
};

/**
 * Validation rules cho đăng ký
 */
export const registerValidation = [
  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('Email không hợp lệ')
    .isLength({ max: 255 })
    .withMessage('Email quá dài'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường và 1 số'),
  body('displayName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Tên hiển thị phải từ 2-50 ký tự')
    .matches(/^[a-zA-Z0-9_\s\u00C0-\u1EF9]+$/)
    .withMessage('Tên hiển thị chỉ được chứa chữ cái, số, dấu gạch dưới và khoảng trắng'),
];

/**
 * Validation rules cho đăng nhập
 */
export const loginValidation = [
  body('email').trim().toLowerCase().isEmail().withMessage('Email không hợp lệ'),
  body('password').notEmpty().withMessage('Mật khẩu là bắt buộc'),
];

/**
 * Validation rules cho tạo thread
 */
export const createThreadValidation = [
  body('text')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Nội dung thread không được quá 5000 ký tự'),
  body('media')
    .optional()
    .isArray()
    .withMessage('Media phải là một mảng')
    .custom((media) => {
      if (media.length > 6) {
        throw new Error('Tối đa 6 media items');
      }
      return true;
    }),
];

/**
 * Validation rules cho comment
 */
export const createCommentValidation = [
  body('text')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Comment phải từ 1-2000 ký tự'),
  body('parentCommentId')
    .optional()
    .custom((value) => {
      if (!value) return true;
      // Simple MongoDB ObjectId validation
      return /^[0-9a-fA-F]{24}$/.test(value);
    })
    .withMessage('parentCommentId không hợp lệ'),
];

