import { Router } from "express";
import {
  cibaAuthenticationController,
  cibaIssueController,
  cibaFailController,
  cibaCompleteController,
} from "../controllers/ciba.controller";

const router = Router();

router.post("/ciba/authentication", cibaAuthenticationController.handle);
router.post("/ciba/issue", cibaIssueController.handle);
router.post("/ciba/fail", cibaFailController.handle);
router.post("/ciba/complete", cibaCompleteController.handle);

export default router;
