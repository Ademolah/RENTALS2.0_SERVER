import { Router } from 'express';
import { toggleFavoriteProperty , getMyFavorites, deleteMe, updateMe, getMe} from '../controllers/user.controller';

import { protect } from '../middlewares/auth.middleware.js';


const router = Router()

router.use(protect)

router.route('/me')
  .get(getMe)
  .patch(updateMe)
  .delete(deleteMe);

router.post('/favorites/:propertyId', toggleFavoriteProperty);
router.get('/favorites',  getMyFavorites);

export default router;