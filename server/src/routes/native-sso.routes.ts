import { Router } from "express";
import {
  nativeSsoProcessController,
  nativeSsoLogoutController,
} from "../controllers/native-sso.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/nativesso", generalLimiter, nativeSsoProcessController.handle);
router.post("/nativesso/logout", generalLimiter, nativeSsoLogoutController.handle);

export default router;
