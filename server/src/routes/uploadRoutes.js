import { Router } from "express";
import multer from "multer";
import { uploadCompanyAsset, uploadProductImage, uploadProfileImage } from "../controllers/uploadController.js";
import { authorize } from "../middleware/authenticate.js";
import { ApiError } from "../utils/http.js";
const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (request, file, callback) => file.mimetype.startsWith("image/") ? callback(null, true) : callback(new ApiError(400, "یوازې Image file قبول کېږي.")),
});
router.post("/product", authorize("administrator", "manager", "store_keeper"), upload.single("file"), uploadProductImage);
router.post("/company", authorize("administrator", "manager"), upload.single("file"), uploadCompanyAsset);
router.post("/profile", upload.single("file"), uploadProfileImage);
export default router;
