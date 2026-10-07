-- Seed the system device categories. Safe to run repeatedly.
INSERT INTO device_categories (id, scope, owner_key, code, name, sort_order, is_active)
VALUES
  (UUID(), 'SYSTEM', 'system', 'computer', '电脑', 1, 1),
  (UUID(), 'SYSTEM', 'system', 'phone', '手机', 2, 1),
  (UUID(), 'SYSTEM', 'system', 'tablet', '平板', 3, 1),
  (UUID(), 'SYSTEM', 'system', 'monitor', '显示器', 4, 1),
  (UUID(), 'SYSTEM', 'system', 'headphones', '耳机', 5, 1),
  (UUID(), 'SYSTEM', 'system', 'keyboard', '键盘', 6, 1),
  (UUID(), 'SYSTEM', 'system', 'mouse', '鼠标', 7, 1),
  (UUID(), 'SYSTEM', 'system', 'camera', '相机', 8, 1),
  (UUID(), 'SYSTEM', 'system', 'console', '游戏机', 9, 1),
  (UUID(), 'SYSTEM', 'system', 'nas', 'NAS', 10, 1),
  (UUID(), 'SYSTEM', 'system', 'storage', '硬盘', 11, 1),
  (UUID(), 'SYSTEM', 'system', 'other', '其他', 12, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);
