// 공유 저장소 설정. 비워 두면 각자 브라우저에만 저장되는 로컬 모드로 동작해요.
// Supabase 프로젝트를 만들고 supabase/schema.sql 을 실행한 뒤 아래 두 값을 채우세요.
// anon key 는 공개되어도 되는 키예요 (실제 보호는 아래 PROJECT_KEY 와 RLS 정책이 담당).
window.APP_CONFIG = {
  SUPABASE_URL: "https://whlvtotianzuqsvovyjw.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_zX5JXgyRWGVzcJWYrwF93g_VqGJWzla",
  // 공유 모드는 URL 에 ?p=프로젝트키 가 있을 때만 켜져요 (키는 레포에 적지 말고 링크로만 공유).
  // ?p= 없이 열면 각자 브라우저에만 저장되는 로컬 모드예요. 아래 값은 로컬 저장 이름으로만 쓰여요.
  DEFAULT_PROJECT: "home",
  // 사진 저장 버킷 이름 (Supabase Storage)
  PHOTO_BUCKET: "photos"
};
