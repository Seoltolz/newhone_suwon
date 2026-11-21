// 공유 저장소 설정. 비워 두면 각자 브라우저에만 저장되는 로컬 모드로 동작해요.
// Supabase 프로젝트를 만들고 supabase/schema.sql 을 실행한 뒤 아래 두 값을 채우세요.
// anon key 는 공개되어도 되는 키예요 (실제 보호는 아래 PROJECT_KEY 와 RLS 정책이 담당).
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  // 같은 평면을 함께 쓰는 사람들끼리 공유하는 키. URL 의 ?p=값 이 있으면 그 값이 우선해요.
  DEFAULT_PROJECT: "home",
  // 사진 저장 버킷 이름 (Supabase Storage)
  PHOTO_BUCKET: "photos"
};
