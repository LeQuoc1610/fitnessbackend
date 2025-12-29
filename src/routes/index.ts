import { Router } from 'express';
import { authRouter } from './auth.js';
import { profilesRouter } from './profiles.js';
import { threadsRouter } from './threads.js';
import { workoutsRouter } from './workouts.js';
import { prsRouter } from './prs.js';
import { followsRouter } from './follows.js';
import { notificationsRouter } from './notifications.js';
import { usersRouter } from './users.js';
import { uploadsRouter } from './uploads.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/profiles', profilesRouter);
apiRouter.use('/threads', threadsRouter);
apiRouter.use('/workouts', workoutsRouter);
apiRouter.use('/prs', prsRouter);
apiRouter.use('/follows', followsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/uploads', uploadsRouter);
