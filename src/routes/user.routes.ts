import { Router } from 'express';
import { toggleFavoriteProperty , getMyFavorites} from '../controllers/user.controller';

import { protect } from '../middlewares/auth.middleware.js';


const router = Router()

router.use(protect)



router.post('/favorites/:propertyId', toggleFavoriteProperty);
router.get('/favorites',  getMyFavorites);

export default router;