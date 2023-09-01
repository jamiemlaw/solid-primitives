import { describe, expect, test } from "vitest";
import * as i18n from "../src/new-i18n.js";
import { createEffect, createResource, createRoot, createSignal } from "solid-js";

describe("resolved values", () => {
  test("function", () => {
    const fn = (a: number, b: string, c: object): number => a + b.length + Object.keys(c).length;
    const translated = i18n.resolved(fn, 1, "two", { foo: "bar" });
    expect(translated).toBe(5);
  });

  test("string", () => {
    expect(i18n.resolved("hello!")).toBe("hello!");
    expect(i18n.resolved("hello {{name}}!", { name: "Tester" })).toBe("hello Tester!");
    expect(i18n.resolved("hello {{name}} and {{extra}}!", { name: "Tester", extra: "John" })).toBe(
      "hello Tester and John!",
    );
    expect(i18n.resolved("hello {{name}} and {{extra}}!" as string)).toBe(
      "hello {{name}} and {{extra}}!",
    );
  });

  test("other value", () => {
    expect(i18n.resolved(1)).toBe(1);
    expect(i18n.resolved(true)).toBe(true);
    expect(i18n.resolved(null)).toBe(null);
    expect(i18n.resolved(undefined)).toBe(undefined);
  });
});

class MyClass {
  constructor(public name: string) {}
}

const en_dict = {
  hello: "Hello {{name}}! How is your {{thing}}?",
  numbers: {
    1: "one",
    2: "two",
    3: "three",
  },
  data: {
    class: new MyClass("hello"), // test classes
    currency: {
      name: "dollar",
      symbol: "$",
      iso: "USD",
      "to.usd": 1, // test dot notation
    },
    users: [{ name: "John" }, { name: "Kate" }],
    formatList(list: string[]) {
      const last = list.pop();
      return `${list.join(", ")} and ${last}`;
    },
  },
};

type Dict = typeof en_dict;
type Locale = "en" | "pl";

const pl_dict = {
  hello: "Cześć {{name}}!",
  numbers: {
    1: "jeden",
    2: "dwa",
    3: "trzy",
  },
  data: {
    class: new MyClass("cześć"),
    currency: {
      name: "złoty",
      symbol: "zł",
      iso: "PLN",
      "to.usd": 0.27,
    },
    users: [{ name: "Jan" }, { name: "Kasia" }, { name: "Tester" }],
    formatList(list: string[]) {
      const last = list.pop();
      return `${list.join(", ")} i ${last}`;
    },
  },
} satisfies Dict;

describe("dict", () => {
  test("resolverDict", () => {
    const resolvers = i18n.resolverDict(en_dict);

    const hello = resolvers.hello({ name: "Tester", thing: "day" });
    expect(hello).toBe("Hello Tester! How is your day?");

    const numbers = resolvers.numbers();
    expect(numbers).toEqual(en_dict.numbers);

    const number1 = resolvers["numbers.1"]();
    expect(number1).toBe("one");

    const data = resolvers.data();
    expect(data).toEqual(en_dict.data);

    const data_class = resolvers["data.class"]();
    expect(data_class).toBe(en_dict.data.class);

    const currency = resolvers["data.currency"]();
    expect(currency).toEqual(en_dict.data.currency);

    const currency_name = resolvers["data.currency.name"]();
    expect(currency_name).toBe("dollar");

    const currency_to_usd = resolvers["data.currency.to.usd"]();
    expect(currency_to_usd).toBe(1);

    const users = resolvers["data.users"]();
    expect(users).toEqual(en_dict.data.users);

    const users_0 = resolvers["data.users.0"]!();
    expect(users_0).toEqual(en_dict.data.users[0]);

    const users_0_name = resolvers["data.users.0.name"]!();
    expect(users_0_name).toBe("John");

    const users_69_resolver = resolvers["data.users.69"];
    expect(users_69_resolver).toBeUndefined();

    const users_69_name_resolver = resolvers["data.users.69.name"];
    expect(users_69_name_resolver).toBeUndefined();

    const format_list = resolvers["data.formatList"](["John", "Kate", "Tester"]);
    expect(format_list).toBe("John, Kate and Tester");
  });
});

describe("chainedResolver", () => {
  let resolvers = i18n.resolverDict(en_dict);
  const dict = i18n.chainedResolver(en_dict, (path, ...args) =>
    // @ts-expect-error
    resolvers[path](...args),
  );

  test("initial", () => {
    const hello = dict.hello({ name: "Tester", thing: "day" });
    expect(hello).toBe("Hello Tester! How is your day?");

    const number1 = dict.numbers[1]();
    expect(number1).toBe("one");

    const data_class = dict.data.class();
    expect(data_class).toBe(en_dict.data.class);

    const currency_name = dict.data.currency.name();
    expect(currency_name).toBe("dollar");

    const currency_to_usd = dict.data.currency["to.usd"]();
    expect(currency_to_usd).toBe(1);

    const users = dict.data.users();
    expect(users).toEqual(en_dict.data.users);

    const format_list = dict.data.formatList(["John", "Kate", "Tester"]);
    expect(format_list).toBe("John, Kate and Tester");
  });

  test("after change", () => {
    resolvers = i18n.resolverDict(pl_dict);

    const hello = dict.hello({ name: "Tester", thing: "dzień" });
    expect(hello).toBe("Cześć Tester!");

    const number1 = dict.numbers[1]();
    expect(number1).toBe("jeden");

    const data_class = dict.data.class();
    expect(data_class).toBe(pl_dict.data.class);

    const currency_name = dict.data.currency.name();
    expect(currency_name).toBe("złoty");

    const currency_to_usd = dict.data.currency["to.usd"]();
    expect(currency_to_usd).toBe(0.27);

    const users = dict.data.users();
    expect(users).toEqual(pl_dict.data.users);

    const format_list = dict.data.formatList(["John", "Kate", "Tester"]);
    expect(format_list).toBe("John, Kate i Tester");
  });
});

describe("reactive", () => {
  test("with translator", async () => {
    const [locale, setLocale] = createSignal<"en" | "pl">("en");
    let captured = "";

    const dispose = createRoot(dispose => {
      const [dict] = createResource(
        locale,
        async locale => {
          const dict = locale === "en" ? en_dict : pl_dict;
          return i18n.resolverDict(dict);
        },
        { initialValue: i18n.resolverDict(en_dict) },
      );

      const t = i18n.translator(dict);

      createEffect(() => {
        captured = t("hello", { name: "Tester", thing: "day" });
      });

      return dispose;
    });

    expect(captured).toBe("Hello Tester! How is your day?");

    setLocale("pl");
    await Promise.resolve();
    expect(captured).toBe("Cześć Tester!");

    dispose();
  });

  test("with cache", async () => {
    const [locale, setLocale] = createSignal<Locale>("en");
    let captured = "";

    const cache = new i18n.SimpleCache((locale: Locale) => {
      const dict = locale === "en" ? en_dict : pl_dict;
      return i18n.resolverDict(dict);
    });
    const en_resolvers = i18n.resolverDict(en_dict);
    cache.cache.set("en", en_resolvers);

    const dispose = createRoot(dispose => {
      const [dict] = createResource<i18n.ResolverDict<Dict> | undefined, Locale>(
        locale,
        (locale, info) => {
          const res = cache.get(locale);
          if (!res) return info.value;
          if (res instanceof Promise) return res.then(res => res ?? info.value);
          return res;
        },
        // { initialValue: en_resolvers },
      );

      const t = i18n.translator(dict);

      createEffect(() => {
        captured = t("hello", { name: "Tester", thing: "day" }) ?? "";
      });

      return dispose;
    });

    expect(captured).toBe("Hello Tester! How is your day?");

    setLocale("pl");
    await Promise.resolve();
    expect(captured).toBe("Cześć Tester!");

    dispose();
  });
});
