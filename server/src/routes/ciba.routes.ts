import { Router } from "express";
import {
  cibaAuthenticationController,
  cibaIssueController,
  cibaFailController,
  cibaCompleteController,
} from "../controllers/ciba.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/ciba/authentication", generalLimiter, cibaAuthenticationController.handle);
router.post("/ciba/issue", generalLimiter, cibaIssueController.handle);
router.post("/ciba/fail", generalLimiter, cibaFailController.handle);
router.post("/ciba/complete", generalLimiter, cibaCompleteController.handle);

export default router;
