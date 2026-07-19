import { ApiPageShell } from '@/components/api/ApiSubNav';
import { ComingSoon } from '@/components/platform/ComingSoon';

export default function ApiSdkPage() {
  return (
    <ApiPageShell title="SDK" description="Bộ công cụ tích hợp API cho đại lý.">
      <ComingSoon detail="SDK chính thức sẽ được phát hành trong mốc tiếp theo. Hiện tại vui lòng dùng Tài liệu API và Test API." />
    </ApiPageShell>
  );
}
