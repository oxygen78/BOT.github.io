import os
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from telegram import Update, LabeledPrice, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, filters, PreCheckoutQueryHandler, ContextTypes, ApplicationBuilder
from dotenv import load_dotenv


# 1. Инициализация окружения и БД
load_dotenv()
TELEGRAM_TOKEN = os.getenv('TELEGRAM_TOKEN')
PAYMENT_PROVIDER_TOKEN = os.getenv('PAYMENT_PROVIDER_TOKEN')
DATABASE_URL = os.getenv('DATABASE_URL')

Base = declarative_base()
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
session = Session()

# 2. Модели базы данных
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

# Создаем таблицы
Base.metadata.create_all(engine)


# 3. Обработчики команд бота
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Привет! Бодро жопаловать в CrushW1N. Пиши /help чтобы ознакомится с доступными командами.")



async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    help_text = (
        "Доступные команды:\n"
        "/start - Начать работу\n"
        "/help - Меню помощи\n"
        "/app - Наше приложение\n"
        "/catalog - Каталог товаров\n"
        "/cart - Ваша корзина\n"
        "/checkout - Оплатить заказ"
    )
    await update.message.reply_text(help_text)

async def miniapp(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton(
            text="Открыть приложение",
            web_app=WebAppInfo(
                url="https://oxygen78.github.io/BOT.github.io/"
            )
        )]
    ]

    await update.message.reply_text(
        "Нажми кнопку:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def catalog(update: Update, context: ContextTypes.DEFAULT_TYPE):
    items = session.query(Item).all()
    if items:
        message = "Каталог товаров:\n"
        for item in items:
            message += f"• {item.name} — {item.price:.2f} RUB\n"
        message += "\nПросто напиши название товара, чтобы добавить его в корзину."
    else:
        message = "Каталог пуст."
    await update.message.reply_text(message)





async def add_to_cart(update: Update, context: ContextTypes.DEFAULT_TYPE):
    item_name = update.message.text.strip()
    item = session.query(Item).filter_by(name=item_name).first()
    
    if item:
        cart_item = session.query(CartItem).filter_by(user_id=update.message.chat_id, item_id=item.id).first()
        if cart_item:
            cart_item.quantity += 1
        else:
            cart_item = CartItem(user_id=update.message.chat_id, item_id=item.id, quantity=1)
            session.add(cart_item)
        
        session.commit()
        await update.message.reply_text(f"Товар '{item_name}' добавлен в корзину!")
    else:
        # Если текст не совпадает с товаром, бот просто не реагирует или просит уточнить
        await update.message.reply_text("Товар не найден. Посмотрите /catalog")





async def view_cart(update: Update, context: ContextTypes.DEFAULT_TYPE):
    cart_items = session.query(CartItem).filter_by(user_id=update.message.chat_id).all()
    if cart_items:
        message = "Ваша корзина:\n"
        total = 0
        for cart_item in cart_items:
            item_total = cart_item.quantity * cart_item.item.price
            message += f"• {cart_item.item.name} ({cart_item.quantity} шт.) — {item_total:.2f} RUB\n"
            total += item_total
        message += f"\nИтого: {total:.2f} RUB\n/checkout для оплаты."
    else:
        message = "Ваша корзина пуста."
    await update.message.reply_text(message)





async def checkout(update: Update, context: ContextTypes.DEFAULT_TYPE):
    cart_items = session.query(CartItem).filter_by(user_id=update.message.chat_id).all()
    if not cart_items:
        await update.message.reply_text("Ваша корзина пуста.")
        return

    prices = []
    for cart_item in cart_items:
        # Telegram принимает цены в минимальных единицах валюты (копейках)
        amount = int(cart_item.item.price * 100 * cart_item.quantity)
        prices.append(LabeledPrice(f"{cart_item.item.name} x{cart_item.quantity}", amount))

    await context.bot.send_invoice(
        chat_id=update.message.chat_id,
        title="Оплата заказа",
        description="Заказ в магазине",
        payload="Custom-Payload",
        provider_token=PAYMENT_PROVIDER_TOKEN,
        currency="RUB",
        prices=prices,
        start_parameter="test-payment",
    )





async def precheckout_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.pre_checkout_query
    if query.invoice_payload != "Custom-Payload":
        await query.answer(ok=False, error_message="Ошибка транзакции.")
    else:
        await query.answer(ok=True)





async def successful_payment_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Очищаем корзину после оплаты
    session.query(CartItem).filter_by(user_id=update.message.chat_id).delete()
    session.commit()
    await update.message.reply_text("Оплата прошла успешно! Спасибо за покупку.")










def main():
    app = Application.builder().token(TELEGRAM_TOKEN).build()

    # Регистрируем обработчики
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("catalog", catalog))
    app.add_handler(CommandHandler("cart", view_cart))
    app.add_handler(CommandHandler("checkout", checkout))
    app.add_handler(CommandHandler("app", miniapp))
    app.add_handler(PreCheckoutQueryHandler(precheckout_callback))
    app.add_handler(MessageHandler(filters.SUCCESSFUL_PAYMENT, successful_payment_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, add_to_cart))

    # Наполнение БД тестовыми товарами при запуске
    if not session.query(Item).first():
        session.add_all([
            Item(name="Сервер", price=100.0),
            Item(name="Облако", price=150.0),
            Item(name="Amvera", price=200.0)
        ])
        session.commit()

    print("Бот запущен...")
    app.run_polling()

if __name__ == '__main__':
    main()