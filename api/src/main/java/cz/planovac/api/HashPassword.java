package cz.planovac.api;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Nouzový nástroj: vytvoří hash hesla pro ruční nastavení v databázi (když se jediný správce zamkl bez možnosti obnovy).
 * Heslo se čte ze standardního vstupu (nezůstane v historii příkazů):
 *   echo -n 'nové-heslo' | java -cp planovac-api.jar cz.planovac.api.HashPassword
 */
public final class HashPassword {
    private HashPassword() {}

    public static void main(String[] args) throws Exception {
        String pw = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine();
        if (pw == null) { System.err.println("Heslo nebylo zadáno na standardní vstup."); System.exit(2); }
        String err = Passwords.policyError(pw, "");
        if (err != null) { System.err.println(err); System.exit(2); }
        System.out.println(Passwords.hash(pw, 600_000));
    }
}
