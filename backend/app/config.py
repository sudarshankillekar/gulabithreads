import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    mongo_uri: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    mongo_db: str = os.getenv("MONGO_DB", "gulabi_threads")
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173").rstrip("/")
    app_secret: str = os.getenv("APP_SECRET", "change-this-dev-secret-before-deploying")
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    razorpay_key_id: str = os.getenv("RAZORPAY_KEY_ID", "")
    razorpay_key_secret: str = os.getenv("RAZORPAY_KEY_SECRET", "")
    cloudinary_cloud_name: str = os.getenv("CLOUDINARY_CLOUD_NAME", "")
    cloudinary_api_key: str = os.getenv("CLOUDINARY_API_KEY", "")
    cloudinary_api_secret: str = os.getenv("CLOUDINARY_API_SECRET", "")
    cloudinary_upload_preset: str = os.getenv("CLOUDINARY_UPLOAD_PRESET", "gulabi_threads")
    cloudinary_folder: str = os.getenv("CLOUDINARY_FOLDER", "gulabi_threads/products")
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_username: str = os.getenv("SMTP_USERNAME", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email: str = os.getenv("SMTP_FROM_EMAIL", "")
    smtp_from_name: str = os.getenv("SMTP_FROM_NAME", "Gulabi Threads")
    smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    admin_order_email: str = os.getenv("ADMIN_ORDER_EMAIL", os.getenv("SMTP_FROM_EMAIL", ""))
    sms_provider: str = os.getenv("SMS_PROVIDER", "brevo").lower()
    brevo_api_key: str = os.getenv("BREVO_API_KEY", "")
    brevo_sms_sender: str = os.getenv("BREVO_SMS_SENDER", "Gulabi")
    brevo_sms_type: str = os.getenv("BREVO_SMS_TYPE", "transactional")
    brevo_sms_tag: str = os.getenv("BREVO_SMS_TAG", "order-confirmation")
    brevo_sms_webhook_url: str = os.getenv("BREVO_SMS_WEBHOOK_URL", "")
    brevo_sms_organisation_prefix: str = os.getenv("BREVO_SMS_ORGANISATION_PREFIX", "Gulabi Threads")
    twilio_account_sid: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth_token: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_from_phone: str = os.getenv("TWILIO_FROM_PHONE", "")
    twilio_messaging_service_sid: str = os.getenv("TWILIO_MESSAGING_SERVICE_SID", "")
    sms_default_country_code: str = os.getenv("SMS_DEFAULT_COUNTRY_CODE", "+91")


settings = Settings()
