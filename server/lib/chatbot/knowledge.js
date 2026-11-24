/**
 * Tri thức tĩnh của trợ lý ảo PUBLIC (chatbot) – Chuyên trang điện tử về
 * phòng, chống ma túy tại Thành phố Hồ Chí Minh.
 *
 * Nội dung ở đây là kiến thức phổ thông đã biên soạn sẵn (không phải tư vấn
 * y tế/pháp lý cá nhân) và được nạp vào bộ truy hồi cùng dữ liệu công khai
 * do CMS quản lý (bài viết, văn bản pháp luật, cơ sở hỗ trợ, sự kiện...).
 *
 * Mỗi mục:
 *   id        – định danh ổn định
 *   topic     – nhóm nội dung, dùng cho gợi ý câu hỏi
 *   title     – tiêu đề hiển thị kèm câu trả lời
 *   keywords  – từ khóa (đã bỏ dấu, chữ thường) phục vụ chấm điểm truy hồi
 *   answer    – câu trả lời dạng văn bản thuần (không chứa HTML)
 */
'use strict';

/* Thông tin liên hệ hiển thị trên site – dùng chung cho câu trả lời */
const CONTACT = {
  hotline: '113 (công an) hoặc 115 (cấp cứu y tế)',
  consultPhone: '0982.120.908',
  email: 'hcmcdpce@gmail.com',
  address: 'Số 10 Đường 3/2, Hòa Hưng, TP. Hồ Chí Minh',
};

const KB = [
  {
    id: 'dinh-nghia-ma-tuy',
    topic: 'kien-thuc',
    title: 'Ma túy là gì?',
    keywords: ['ma tuy', 'dinh nghia', 'khai niem', 'phan biet', 'la gi'],
    answer: 'Ma túy là các chất gây nghiện, chất hướng thần được quy định trong danh mục do Chính phủ ban hành '
      + '(các chất ma túy và tiền chất dùng vào việc sản xuất, điều chế chất ma túy). Chất gây nghiện là chất kích thích '
      + 'hoặc ức chế thần kinh, dễ gây tình trạng nghiện; chất hướng thần là chất kích thích hoặc ức chế thần kinh '
      + 'hoặc gây ảo giác, nếu sử dụng nhiều lần có thể dẫn tới tình trạng nghiện. Sử dụng, tàng trữ, mua bán trái phép '
      + 'chất ma túy đều là hành vi vi phạm pháp luật.',
  },
  {
    id: 'khai-niem-ma-tuy',
    topic: 'kien-thuc',
    title: 'Ma túy là gì?',
    keywords: ['ma tuy', 'la gi', 'dinh nghia', 'chat gay nghien', 'chat huong than', 'chat gay ao giac', 'tien chat',
      'phan loai'],
    answer: 'Theo Luật Phòng, chống ma túy, ma túy là các chất gây nghiện, chất hướng thần được quy định trong '
      + 'danh mục do Chính phủ ban hành (các chất ma túy và tiền chất dùng vào việc sản xuất, điều chế chất ma túy). '
      + 'Ma túy được chia thành nhiều nhóm: nhóm chất gây nghiện (như thuốc phiện, heroin, cần sa) và nhóm chất '
      + 'hướng thần/kích thích (như amphetamine, methamphetamine, MDMA); theo nguồn gốc có ma túy tự nhiên, '
      + 'bán tổng hợp và tổng hợp. Lưu ý: chỉ cần sử dụng, tàng trữ trái phép chất ma túy là hành vi vi phạm pháp luật. '
      + 'Bạn có thể đọc thêm chuyên đề “Nhận diện ma túy” và “Nguồn gốc của ma túy” trong mục Tuyên truyền - Giáo dục.',
  },
  {
    id: 'dau-hieu-nhan-biet',
    topic: 'kien-thuc',
    title: 'Dấu hiệu nhận biết người sử dụng ma túy',
    keywords: ['dau hieu', 'nhan biet', 'nguoi su dung', 'nghi ngo', 'tre em', 'con em', 'hoc sinh', 'bieu hien',
      'thay doi'],
    answer: 'Không có dấu hiệu nào tự nó khẳng định chắc chắn một người sử dụng ma túy, nhưng các biểu hiện đáng lưu ý gồm: '
      + 'thay đổi thất thường về giờ giấc sinh hoạt, lén lút, tiêu tiền bất thường hoặc bán đồ đạc; thay đổi tâm trạng '
      + 'nhanh (hưng phấn quá mức rồi uể oải, cáu gắt, lo âu); sụt cân, ngủ ít, mắt đỏ, đồng tử giãn hoặc co nhỏ bất thường; '
      + 'xuất hiện dụng cụ lạ (giấy bạc, ống hút, kim tiêm, bình hút…), mùi lạ ở phòng, quần áo; thay đổi nhóm bạn, '
      + 'bỏ học, thu mình khỏi gia đình. Nếu nhiều dấu hiệu xuất hiện cùng lúc, bạn nên bình tĩnh trò chuyện, '
      + 'tìm hiểu thay vì kết luận, và liên hệ Trạm y tế/ Công an cấp xã hoặc tổng đài tư vấn ' + CONTACT.consultPhone + '.',
  },
  {
    id: 'tac-hai',
    topic: 'kien-thuc',
    title: 'Tác hại của ma túy',
    keywords: ['tac hai', 'he luy', 'anh huong', 'suc khoe', 'gia dinh', 'xa hoi', 'tai nan', 'nghien'],
    answer: 'Ma túy gây tổn hại nghiêm trọng trên ba phương diện: (1) Sức khỏe – rối loạn hệ thần kinh, tổn thương tim mạch, '
      + 'gan, phổi; suy kiệt, dễ mắc HIV/AIDS, viêm gan B, C khi sử dụng chung kim tiêm; quá liều có thể tử vong. '
      + '(2) Gia đình – mất khả năng lao động, chi phí điều trị lớn, tan vỡ hạnh phúc, ảnh hưởng trực tiếp đến trẻ em. '
      + '(3) Xã hội – gia tăng tội phạm, tai nạn giao thông, tệ nạn, gây gánh nặng cho an sinh xã hội. '
      + 'Ngoài ra, người sử dụng trái phép chất ma túy và người liên quan còn chịu chế tài hành chính hoặc hình sự theo quy định.',
  },
  {
    id: 'ky-nang-tu-choi',
    topic: 'ky-nang',
    title: 'Cách từ chối khi bị rủ rê sử dụng ma túy',
    keywords: ['ky nang', 'tu choi', 'ru re', 'cam do', 'ban be', 'lam gi', 'ung pho', 'bi ep', 'tiep can'],
    answer: 'Bốn nguyên tắc cần nhớ: (1) Nói “không” rõ ràng, ngắn gọn ngay từ lần đầu, không giải thích dài dòng; '
      + '(2) Rời khỏi tình huống – đứng dậy, gọi người thân/bạn tin cậy đến đón; (3) Từ chối có lý do xã hội '
      + '(“Tôi đang uống thuốc”, “Tôi phải về nhà ngay”); (4) Quan sát – không nhận đồ ăn, nước uống từ người lạ, '
      + 'không để đồ uống ra khỏi tầm nhìn. Nếu bị ép buộc hoặc bị đe dọa, hãy tìm nơi đông người và gọi '
      + 'công an (113) hoặc số tư vấn ' + CONTACT.consultPhone + '. Các chuyên đề “Trang bị kỹ năng…” và '
      + '“Kỹ năng từ chối ma túy” trong mục Tuyên truyền - Giáo dục hướng dẫn chi tiết hơn.',
  },
  {
    id: 'phat-hien-to-giac',
    topic: 'xu-ly',
    title: 'Phát hiện người sử dụng hoặc tụ điểm ma túy – cần báo ở đâu?',
    keywords: ['to giac', 'bao tin', 'bao o dau', 'toi pham', 'tu diem', 'công an', 'cong an', 'duong day nong',
      'tin bao', 'phan anh'],
    answer: 'Khi phát hiện hành vi mua bán, tàng trữ, tổ chức sử dụng trái phép chất ma túy hoặc tụ điểm phức tạp, bạn nên: '
      + '(1) Gọi ngay 113 hoặc số điện thoại của Công an cấp xã/phường nơi xảy ra sự việc; '
      + '(2) Cung cấp thông tin cụ thể về địa điểm, thời gian, đối tượng (nếu biết), tuyệt đối không tự xử lý trực tiếp '
      + 'để tránh nguy hiểm; (3) Có thể gửi phản ánh trực tuyến qua mục Liên hệ – chọn loại “Phản ánh tin báo” – '
      + 'hệ thống sẽ cấp mã tiếp nhận để tra cứu. Thông tin người báo tin được giữ bí mật theo quy định pháp luật.',
  },
  {
    id: 'cai-nghien-tu-nguyen',
    topic: 'ho-tro',
    title: 'Quy trình đăng ký cai nghiện tự nguyện',
    keywords: ['cai nghien', 'tu nguyen', 'thu tuc', 'dang ky', 'quy trinh', 'cac buoc', 'ho so', 'giay to'],
    answer: 'Quy trình 4 bước đang áp dụng tại TP. Hồ Chí Minh: (1) Khai báo và tiếp nhận – đến Công an cấp xã, '
      + 'UBND hoặc Trạm y tế nơi cư trú để tự giác khai báo và nhận hướng dẫn; (2) Xác định tình trạng nghiện – '
      + 'cơ sở y tế đủ điều kiện xét nghiệm chất ma túy và kết luận theo quy trình của Bộ Y tế; (3) Lựa chọn hình thức '
      + 'cai nghiện tự nguyện phù hợp (tại gia đình/cộng đồng hoặc tại cơ sở công lập) và ký cam kết; '
      + '(4) Hỗ trợ tái hòa nhập – lập hồ sơ quản lý sau cai, học nghề, giới thiệu việc làm. '
      + 'Hồ sơ cơ bản: Thẻ Căn cước/CCCD hoặc tài khoản VNeID mức 2, không cần sổ hộ khẩu giấy. '
      + 'Gọi ' + CONTACT.consultPhone + ' để được tư vấn cụ thể.',
  },
  {
    id: 'chi-phi-methadone',
    topic: 'ho-tro',
    title: 'Chi phí điều trị Methadone',
    keywords: ['methadone', 'chi phi', 'mien phi', 'thuoc thay the', 'dieu tri', 'co so y te', 'dang ky'],
    answer: 'Điều trị nghiện các chất dạng thuốc phiện bằng thuốc thay thế (Methadone) giúp kiểm soát cơn thèm nhớ, '
      + 'giảm nguy cơ lây nhiễm HIV, viêm gan qua đường máu và ổn định sức khỏe. Tại các cơ sở công lập ở TP. Hồ Chí Minh, '
      + 'thuốc Methadone được cấp phát miễn phí, người bệnh chỉ đóng góp chi phí dịch vụ y tế ở mức tối thiểu (theo '
      + 'Nghị định 90/2016/NĐ-CP và Nghị quyết hỗ trợ của HĐND Thành phố). Bạn có thể tra cứu cơ sở điều trị gần nhất '
      + 'tại trang Hỗ trợ cai nghiện, mục “Tra cứu cơ sở y tế và điểm tư vấn”.',
  },
  {
    id: 'sau-cai-nghien',
    topic: 'ho-tro',
    title: 'Hỗ trợ sau cai nghiện, tái hòa nhập cộng đồng',
    keywords: ['sau cai', 'tai hoa nhap', 'hoc nghe', 'viec lam', 'quan ly sau cai', 'ho tro', 'khoi phuc'],
    answer: 'Sau khi hoàn thành chương trình cai nghiện, người được quản lý sau cai tại nơi cư trú, được tư vấn tâm lý định kỳ, '
      + 'hỗ trợ cập nhật dữ liệu cư trú, cấp Thẻ Căn cước, tham gia đào tạo nghề và tiếp cận nguồn vốn tín dụng chính sách '
      + 'để tạo việc làm. Gia đình và tổ chức xã hội đóng vai trò quan trọng giúp người sau cai không tái nghiện. '
      + 'Chi tiết tại trang Hỗ trợ cai nghiện của Chuyên trang.',
  },
  {
    id: 'xu-ly-hanh-chinh',
    topic: 'phap-luat',
    title: 'Mức xử phạt khi sử dụng trái phép chất ma túy',
    keywords: ['xu phat', 'hanh chinh', 'phat tien', 'vi pham', 'xu ly', 'su dung trai phep', 'hinh su', 'truy cuu'],
    answer: 'Người sử dụng trái phép chất ma túy bị xử phạt vi phạm hành chính (phạt tiền) và bị quản lý theo quy định '
      + 'của Luật Phòng, chống ma túy; nếu tái phạm trong thời gian đang cai nghiện/quản lý sau cai, đang điều trị thay thế '
      + 'hoặc đã bị xử phạt hành chính mà còn vi phạm có thể bị truy cứu trách nhiệm hình sự theo Điều 256a Bộ luật Hình sự. '
      + 'Các hành vi tàng trữ, vận chuyển, mua bán, tổ chức sử dụng trái phép chất ma túy có mức hình phạt nghiêm khắc. '
      + 'Mức phạt cụ thể phụ thuộc loại và khối lượng chất ma túy – bạn nên tra cứu văn bản trong mục Pháp luật.',
  },
  {
    id: 'tu-giac-khai-bao',
    topic: 'phap-luat',
    title: 'Tự giác khai báo có bị truy cứu trách nhiệm hình sự?',
    keywords: ['tu giac', 'khai bao', 'truy cuu', 'hinh su', 'co bi', 'ban an'],
    answer: 'Người tự giác khai báo tình trạng nghiện để đăng ký cai nghiện tự nguyện được hỗ trợ tiếp cận y tế và không bị '
      + 'truy cứu trách nhiệm hình sự. Pháp luật chỉ truy cứu trách nhiệm hình sự nếu người đó tái sử dụng ma túy trong thời gian '
      + 'đang cai nghiện, đang điều trị thay thế, đang quản lý sau cai hoặc đã bị xử phạt hành chính mà còn vi phạm.',
  },
  {
    id: 'luat-pcmt',
    topic: 'phap-luat',
    title: 'Luật Phòng, chống ma túy số 120/2025/QH15',
    keywords: ['luat phong chong ma tuy', '120/2025', 'quoc hoi', 'van ban', 'luat ', 'quy dinh'],
    answer: 'Luật Phòng, chống ma túy số 120/2025/QH15 đang được công bố trên Chuyên trang, kèm Nghị định 163/2026/NĐ-CP '
      + 'quy định chi tiết và hướng dẫn thi hành. Luật quy định về phòng, chống ma túy; quản lý người sử dụng trái phép chất ma túy; '
      + 'cai nghiện ma túy; trách nhiệm của cá nhân, gia đình, cơ quan, tổ chức; quản lý nhà nước và hợp tác quốc tế. '
      + 'Bạn xem nội dung chi tiết tại trang Pháp luật.',
  },
];

/* Câu hỏi gợi ý hiển thị khi mở khung chat và khi người dùng bấm “Gợi ý” */
const SUGGESTED_QUESTIONS = [
  { text: 'Ma túy là gì và được phân loại như thế nào?', topic: 'kien-thuc' },
  { text: 'Làm sao nhận biết một người nghi sử dụng ma túy?', topic: 'kien-thuc' },
  { text: 'Thủ tục đăng ký cai nghiện tự nguyện gồm những gì?', topic: 'ho-tro' },
  { text: 'Điều trị Methadone có mất phí không?', topic: 'ho-tro' },
  { text: 'Tôi phát hiện tụ điểm ma túy, cần báo cho ai?', topic: 'xu-ly' },
  { text: 'Sử dụng trái phép ma túy bị xử phạt thế nào?', topic: 'phap-luat' },
  { text: 'Cách từ chối khi bị rủ rê sử dụng ma túy?', topic: 'ky-nang' },
  { text: 'Tra cứu văn bản pháp luật về phòng, chống ma túy', topic: 'phap-luat' },
  { text: 'Cơ sở hỗ trợ, tư vấn cai nghiện ở TP. Hồ Chí Minh?', topic: 'ho-tro' },
  { text: 'Tin tức mới trên Chuyên trang', topic: 'kien-thuc' },
  { text: 'Số liệu thống kê công tác phòng, chống ma túy', topic: 'kien-thuc' },
];

/* Nhóm nội dung dùng để phân loại câu trả lời và chọn liên kết gợi ý */
const TOPICS = {
  'kien-thuc': 'Kiến thức chung về ma túy',
  'ky-nang': 'Kỹ năng phòng ngừa',
  'ho-tro': 'Hỗ trợ, cai nghiện',
  'phap-luat': 'Pháp luật',
  'xu-ly': 'Xử lý, tố giác',
};

module.exports = { KB, SUGGESTED_QUESTIONS, TOPICS, CONTACT };
