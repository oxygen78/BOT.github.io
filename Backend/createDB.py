import os
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, declarative_base # Обновили импорт
from dotenv import load_dotenv # Добавили загрузку env

# 1. ЗАГРУЗКА ОКРУЖЕНИЯ
# Это обязательно! Без этого os.getenv не увидит ваш файл .env
load_dotenv()

# 2. НАСТРОЙКА БАЗЫ
# Теперь SQLAlchemy 2.0 рекомендует импортировать Base так:
Base = declarative_base()

db_url = os.getenv('DATABASE_URL')
if not db_url:
    raise ValueError("Ошибка: DATABASE_URL не найден в файле .env. Проверьте его наличие!")

engine = create_engine(db_url)
Session = sessionmaker(bind=engine)
session = Session()

# 3. ОПРЕДЕЛЕНИЕ МОДЕЛЕЙ (Сначала описываем, что создавать)
class Item(Base):
    __tablename__ = 'items'
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    price = Column(Float, nullable=False)

class CartItem(Base):
    __tablename__ = 'cart_items'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    item_id = Column(Integer, ForeignKey('items.id'), nullable=False)
    quantity = Column(Integer, default=1)
    item = relationship("Item")

# 4. СОЗДАНИЕ ТАБЛИЦ (Только после того, как описали классы выше!)
Base.metadata.create_all(engine)

# 5. ТЕСТОВАЯ РАБОТА С ДАННЫМИ
# Проверяем, есть ли уже такой товар, чтобы не плодить дубликаты
existing_item = session.query(Item).filter_by(name="Sample Item").first()

if not existing_item:
    new_item = Item(name="Sample Item", price=19.99)
    session.add(new_item)
    session.commit()
    print("Товар успешно добавлен!")
else:
    print(f"Товар уже есть в БД: {existing_item.name} - {existing_item.price}")

# Вывод результата
item = session.query(Item).filter_by(name="Sample Item").first()
print(f"Результат из БД: {item.name}, {item.price}") 