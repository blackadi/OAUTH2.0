import { Router } from "express";
import {
  dcrRegisterController,
  dcrGetController,
  dcrUpdateController,
  dcrDeleteController,
} from "../controllers/dcr.controller";

const router = Router();

router.post("/client/dcr/register", dcrRegisterController.handleDcrRegister);
router.post("/client/dcr/get", dcrGetController.handleDcrGet);
router.post("/client/dcr/update", dcrUpdateController.handleDcrUpdate);
router.post("/client/dcr/delete", dcrDeleteController.handleDcrDelete);

export default router;
