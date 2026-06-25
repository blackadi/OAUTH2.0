import { Router } from "express";
import {
  dcrRegisterController,
  dcrGetController,
  dcrUpdateController,
  dcrDeleteController,
} from "../controllers/dcr.controller";
import { generalLimiter } from "../middleware/rate-limit";

const router = Router();

router.post("/client/dcr/register", generalLimiter, dcrRegisterController.handleDcrRegister);
router.post("/client/dcr/get", generalLimiter, dcrGetController.handleDcrGet);
router.post("/client/dcr/update", generalLimiter, dcrUpdateController.handleDcrUpdate);
router.post("/client/dcr/delete", generalLimiter, dcrDeleteController.handleDcrDelete);

export default router;
