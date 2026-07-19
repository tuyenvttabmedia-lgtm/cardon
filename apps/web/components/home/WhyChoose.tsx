const reasons = [
  {
    title: 'Giao thẻ tự động',
    description: 'Hệ thống xử lý ngay sau khi thanh toán thành công.',
  },
  {
    title: 'Thanh toán đa kênh',
    description: 'Hỗ trợ chuyển khoản QR và thanh toán qua ngân hàng tiện lợi.',
  },
  {
    title: 'Bảo mật PIN',
    description: 'Mã PIN chỉ hiển thị khi đơn hàng đã hoàn tất.',
  },
  {
    title: 'Guest checkout',
    description: 'Mua không cần đăng ký — chỉ cần email nhận đơn.',
  },
];

export function WhyChoose() {
  return (
    <section className="mt-16 rounded-3xl border border-gray-200 bg-white p-8">
      <h2 className="text-2xl font-bold text-gray-900">Vì sao chọn CardOn?</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {reasons.map((item) => (
          <div key={item.title}>
            <h3 className="font-semibold text-brand-700">{item.title}</h3>
            <p className="mt-2 text-sm text-gray-600">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
