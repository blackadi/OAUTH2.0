import { Router } from "express";
import { userinfoController } from "../controllers/userinfo.controller";

const router = Router();

router.post("/userinfo", userinfoController.handleUserInfo);
router.get("/userinfo", userinfoController.handleUserInfo);

export default router;
