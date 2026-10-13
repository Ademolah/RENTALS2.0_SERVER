import { Router } from 'express';
import { toggleFavoriteProperty , getMyFavorites, deleteMe, updateMe, getMe, uploadAvatar} from '../controllers/user.controller';
import { upload } from '../middlewares/upload.middleware.js';
import { protect } from '../middlewares/auth.middleware.js';


const router = Router()

router.use(protect)

router.route('/me')
  .get(getMe)
  .patch(updateMe)
  .delete(deleteMe);

router.post('/favorites/:propertyId', toggleFavoriteProperty);
router.get('/favorites',  getMyFavorites);
router.patch('/me/avatar', protect, upload.single('image'), uploadAvatar);

export default router;