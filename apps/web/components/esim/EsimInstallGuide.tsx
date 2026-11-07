import type { ReactNode } from 'react';
import type { EsimPreviewOffer } from '@/lib/esim-offers';

export function EsimInstallGuide({
  offer,
  country,
}: {
  offer?: EsimPreviewOffer | null;
  country: string;
}) {
  const notes = offer?.operatorInfo?.filter(Boolean) ?? [];
  const networks = offer?.networks?.filter(Boolean) ?? [];
  const activation = offer?.activationLabel || 'Theo hướng dẫn kèm mã cài trong tài khoản.';
  const apn =
    offer?.apnType?.toLowerCase() === 'manual' && offer.apnValue
      ? `Cần nhập APN thủ công: ${offer.apnValue}.`
      : 'APN thường tự cấu hình sau khi cài eSIM.';
  const roaming = offer?.isRoaming
    ? 'Bật Roaming dữ liệu cho eSIM này khi đến nơi.'
    : 'Không cần bật roaming trừ khi hướng dẫn trên máy yêu cầu.';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <GuideCard title="iPhone / iPad">
          <ol>
            <li>Giữ Wi‑Fi ổn định. Vào Cài đặt → Di động / Dữ liệu di động → Thêm eSIM.</li>
            <li>Quét mã QR, hoặc chọn Nhập chi tiết rồi dán chuỗi LPA từ tài khoản CardOn.</li>
            <li>Đặt nhãn “eSIM {country}”, bật eSIM này cho Dữ liệu di động.</li>
            <li>Đến nơi thì bật Dữ liệu di động cho eSIM. {roaming}</li>
          </ol>
        </GuideCard>
        <GuideCard title="Android">
          <ol>
            <li>Giữ Wi‑Fi ổn định. Vào Cài đặt → Mạng & internet → SIM → Thêm eSIM.</li>
            <li>Quét mã QR, hoặc chọn nhập mã thủ công và dán chuỗi LPA.</li>
            <li>Đặt eSIM này làm SIM dữ liệu. Tắt dữ liệu SIM Việt Nam nếu muốn tiết kiệm.</li>
            <li>Đến nơi bật dữ liệu di động. {roaming}</li>
          </ol>
        </GuideCard>
      </div>
      <div className="rounded-2xl border border-cardon-border bg-white p-4 text-sm leading-relaxed text-cardon-dark">
        <p className="font-bold text-cardon-navy">Thông tin gói Keyon</p>
        <ul className="mt-2 space-y-1.5">
          <li>Kích hoạt: {activation}</li>
          <li>{apn}</li>
          {networks.length > 0 ? <li>Nhà mạng: {networks.join(', ')}</li> : null}
          {offer?.speedLabel ? <li>Tốc độ ghi nhận: {offer.speedLabel}</li> : null}
          {offer?.rechargeable ? <li>Gói có thể nạp thêm (top-up) sau khi hết dung lượng, nếu còn trong thời hạn eSIM.</li> : null}
          {offer?.fairUsagePolicy ? <li>Chính sách dùng công bằng: {offer.fairUsagePolicy}</li> : null}
          {offer?.shortInfo ? <li>{offer.shortInfo}</li> : null}
          {offer?.otherInfo ? <li>{offer.otherInfo}</li> : null}
        </ul>
        {notes.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-cardon-gray">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-cardon-gray">
          Sau thanh toán, mã cài nằm ở Tài khoản → eSIM. Hướng dẫn theo từng máy (QR / cài tay / link
          iOS) được cấp sau khi đơn hoàn tất — CardOn hiện chuỗi LPA ngay trên tài khoản.
        </p>
      </div>
    </div>
  );
}

function GuideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card">
      <h3 className="font-bold text-cardon-navy">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-cardon-gray [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5">
        {children}
      </div>
    </div>
  );
}
