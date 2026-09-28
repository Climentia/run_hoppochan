from PIL import Image, ImageDraw
import numpy as np
import os


def image_resize(width, image_name):
    resize_image = img.resize((width, int(width * img.size[1] / img.size[0])))  # 画像のリサイズ
    print("アスペクト比固定　width: {}, height: {}".format(resize_image.size[0], resize_image.size[1]))  # 画像のサイズ出力
    resize_image.save('images/' + image_name)  # 画像の保存


def select_color(color):
    mean = np.array(color).mean(axis=0)
    return (255, 255, 255, 0) if mean >= 250 else color


def to_touka(img):
    w, h = img.size
    touka_img = Image.new('RGBA', (w, h))
    np.array([[touka_img.putpixel((x, y), select_color(img.getpixel((x, y)))) for x in range(w)] for y in range(h)])
    return touka_img


def pic_make(path ,path2):
    img = Image.open(path)  # イメージを開く
    print("元の画像サイズ　width: {}, height: {}".format(img.size[0], img.size[1]))  # 元の画像のサイズ出力
    # 画像を指定したサイズに変更
    img_resize = img.resize((44, 65))  # 画像のリサイズ
    print("指定サイズ　width: {}, height: {}".format(img_resize.size[0], img_resize.size[1]))  # 画像のサイズ出力

    img_resize.save('temp.png')

    img_con = img_resize.convert("RGBA")
    img_touka = to_touka(img_con)

    layer1 = Image.open("./street_view/pic/streetview0.png")
    layer1.paste(img_touka, (0, 30), img_touka)
    layer1.save(path2)


path1 = "./street_view/asasio.jpg"
path2 = "./street_view/test.png"


pic_make(path1, path2)
