def is_int(s):
    try:
        int(s)
        return True
    except ValueError:
        return False


def bar(jud):
    num = round(jud/10) * 2
    txt = ""
    num1 = 20-num
    for i in range(num):
        txt += "#"
    for j in range(num1):
        txt += "_"
    txt = "[" + txt + "]"
    return txt


def duplication(list):
    flag = 0
    for i in list:
        for j in list:
            if i == j:
                flag += 1
    if flag > 2:
        return True
    else:
        return False


def zero_make(H):
    HH = str(H)
    keta = len(HH)
    if keta == 1:
        HH = "0"+HH
        return HH
    else:
        HH = str(H)
        return HH
